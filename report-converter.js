(function (root) {
  "use strict";

  const REQUIRED = ["Airline IataCode", "Airline IcaoCode", "Flight Number", "STAD", "Leg", "Pair Flight", "Pair Flight STAD", "Station Code"];
  const DATE_FORMAT = "dd mmm yyyy hh:mm";

  function value(cell) {
    if (cell == null) return "";
    if (cell instanceof Date) return cell;
    if (typeof cell !== "object") return cell;
    if (cell.result !== undefined) return value(cell.result);
    if (cell.text !== undefined) return cell.text;
    if (Array.isArray(cell.richText)) return cell.richText.map(part => part.text || "").join("");
    return String(cell);
  }

  function dateOf(input) {
    if (input instanceof Date && !Number.isNaN(input.getTime())) return input;
    if (typeof input === "number" && Number.isFinite(input)) return new Date(Math.round((input - 25569) * 86400000));
    if (typeof input === "string" && input.trim()) {
      const parsed = new Date(input);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }

  function flightId(code, number) {
    return `${String(code || "").trim().toUpperCase()}${String(number || "").trim().toUpperCase().replace(/\s+/g, "")}`;
  }

  function normalizedFlight(input) {
    return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function key(leg, id, date) {
    return `${leg}|${id}|${date.getTime()}`;
  }

  function station(row, leg) {
    const parts = String(row.stationCode || "").trim().split(/\s+/);
    return leg === "Arrival" ? parts[0] || "" : parts[parts.length - 1] || "";
  }

  function parseRows(rows) {
    const headers = (rows[0] || []).map(cell => String(value(cell) || "").trim());
    const missing = REQUIRED.filter(header => !headers.includes(header));
    if (missing.length) throw new Error(`Missing report columns: ${missing.join(", ")}.`);
    const column = Object.fromEntries(headers.map((header, index) => [header, index]));
    const entries = [];
    for (let index = 1; index < rows.length; index += 1) {
      const cells = rows[index];
      if (!cells || !cells.some(cell => value(cell) !== "")) continue;
      const get = name => value(cells[column[name]]);
      const leg = String(get("Leg") || "").trim();
      const date = dateOf(get("STAD"));
      const code = String(get("Airline IataCode") || "").trim().toUpperCase();
      const number = String(get("Flight Number") || "").trim();
      if (!date || !code || !number || !["Arrival", "Departure"].includes(leg)) {
        throw new Error(`Row ${index + 1} has an invalid flight number, date, airline, or leg.`);
      }
      entries.push({
        leg, date, code, icao: String(get("Airline IcaoCode") || "").trim(), number,
        id: flightId(code, number), pairId: normalizedFlight(get("Pair Flight")),
        pairDate: dateOf(get("Pair Flight STAD")), airline: String(get("Airline Name") || "").trim(),
        seats: get("Seat Capacity"), stationCode: get("Station Code"), sourceRow: index + 1
      });
    }
    if (!entries.length) throw new Error("No flight rows found in this report.");

    const byKey = new Map();
    for (const entry of entries) {
      const entryKey = key(entry.leg, entry.id, entry.date);
      if (!byKey.has(entryKey)) byKey.set(entryKey, []);
      byKey.get(entryKey).push(entry);
    }

    const used = new Set();
    const pairs = [];
    for (const entry of entries) {
      if (used.has(entry)) continue;
      let partner = null;
      if (entry.pairId && entry.pairDate) {
        const otherLeg = entry.leg === "Arrival" ? "Departure" : "Arrival";
        const candidates = [entry.pairId];
        if (entry.pairId.endsWith("F")) candidates.push(entry.pairId.slice(0, -1));
        partner = candidates.flatMap(id => byKey.get(key(otherLeg, id, entry.pairDate)) || []).find(candidate =>
          candidate !== entry && !used.has(candidate) &&
          (candidate.pairId === entry.id || candidate.pairId === `${entry.id}F`) &&
          candidate.pairDate && candidate.pairDate.getTime() === entry.date.getTime()
        ) || null;
      }
      used.add(entry);
      if (partner) used.add(partner);
      const arrival = entry.leg === "Arrival" ? entry : partner;
      const departure = entry.leg === "Departure" ? entry : partner;
      pairs.push({ arrival, departure, status: partner ? "Paired" : "Unmatched" });
    }
    pairs.sort((a, b) => (a.arrival?.date || a.departure.date) - (b.arrival?.date || b.departure.date)
      || (a.departure?.date || 0) - (b.departure?.date || 0));
    return {
      pairs, flightCount: entries.length, matched: pairs.filter(pair => pair.status === "Paired").length,
      unmatched: pairs.filter(pair => pair.status === "Unmatched").length,
      firstDate: entries.reduce((date, entry) => entry.date < date ? entry.date : date, entries[0].date),
      lastDate: entries.reduce((date, entry) => entry.date > date ? entry.date : date, entries[0].date)
    };
  }

  function parseWorksheet(worksheet) {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      rows[rowNumber - 1] = row.values.slice(1);
    });
    return parseRows(rows);
  }

  function buildWorkbook(parsed, ExcelJS) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Paired flights", { views: [{ state: "frozen", ySplit: 2, xSplit: 0, showGridLines: false }] });
    sheet.mergeCells("A1:C1");
    sheet.mergeCells("D1:F1");
    sheet.mergeCells("G1:I1");
    sheet.getCell("A1").value = "FLIGHT DETAILS";
    sheet.getCell("D1").value = "ARRIVAL";
    sheet.getCell("G1").value = "DEPARTURE";
    sheet.getRow(2).values = ["Airline", "Airline name", "Seats", "Flight", "STA", "From", "Flight", "STD", "To"];
    sheet.columns = [16, 28, 9, 17, 23, 12, 17, 23, 12].map(width => ({ width }));
    sheet.getRow(1).height = 26;
    sheet.getRow(2).height = 26;
    for (let r = 1; r <= 2; r += 1) {
      for (let c = 1; c <= 9; c += 1) {
        const cell = sheet.getCell(r, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r === 1 ? (c <= 3 ? "FF334155" : c <= 6 ? "FF126B45" : "FF0B6BCB") : "FFEAF0F5" } };
        cell.font = { name: "Aptos", size: r === 1 ? 12 : 10, bold: true, color: { argb: r === 1 ? "FFFFFFFF" : "FF223344" } };
        cell.alignment = { vertical: "middle", horizontal: r === 1 ? "center" : "left" };
      }
    }
    parsed.pairs.forEach((pair, index) => {
      const arrival = pair.arrival;
      const departure = pair.departure;
      const shared = arrival || departure;
      const row = sheet.getRow(index + 3);
      row.values = [
        `${shared.code} / ${shared.icao}`, shared.airline, shared.seats === "" ? null : shared.seats,
        arrival ? `${arrival.code} ${arrival.number}` : null, arrival?.date || null, arrival ? station(arrival, "Arrival") : null,
        departure ? `${departure.code} ${departure.number}` : null, departure?.date || null, departure ? station(departure, "Departure") : null
      ];
      row.height = 21;
      for (let c = 1; c <= 9; c += 1) {
        const cell = row.getCell(c);
        cell.font = { name: "Aptos", size: 10, color: { argb: "FF15202B" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pair.status === "Unmatched" ? "FFFFF3DF" : index % 2 ? "FFF4F7FA" : "FFFFFFFF" } };
        cell.alignment = { vertical: "middle" };
        if (c === 5 || c === 8) cell.numFmt = DATE_FORMAT;
        if (c === 4 || c === 7) cell.font.bold = true;
        if (c === 3) cell.alignment.horizontal = "center";
      }
    });
    sheet.autoFilter = { from: "A2", to: `I${parsed.pairs.length + 2}` };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return workbook;
  }

  root.DTNH_REPORT_CONVERTER = { parseRows, parseWorksheet, buildWorkbook };
})(typeof window === "undefined" ? globalThis : window);
