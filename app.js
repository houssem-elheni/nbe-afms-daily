(function () {
  "use strict";

  const TEMPLATE_PATH = "templates/NBE-template.xlsx";
  const START_ROW = 11;
  const TEMPLATE_CAPACITY = 32;
  const BLANK_ROWS_BEFORE_REMARKS = 3;
  const AIRPORT = "ENFIDHA-HAMMAMET  INTERNATIONAL AIRPORT ";
  const ICAO_BY_CARRIER = Object.freeze({
    "4V": "SQY",
    B2: "BRU",
    BY: "TOM",
    DS: "EZS",
    ENT: "ENT",
    EZY: "EZY",
    FB: "LZB",
    H3: "HLJ",
    HN: "HST",
    HT: "HAT",
    LG: "LGL",
    LXJ: "LXJ",
    NO: "NOS",
    QS: "TVS",
    TB: "JAF",
    VJT: "VJT",
    X9: "NVD"
  });
  const FLIGHT_SUFFIX_BY_KEY = Object.freeze({
    "BY|229": "3AY",
    "BY|262": "8LK",
    "BY|468": "7NX",
    "BY|474": "5PV",
    "BY|475": "3WL",
    "BY|528": "16N",
    "BY|588": "24E",
    "BY|589": "5EN",
    "BY|612": "4YW",
    "BY|682": "9JL",
    "BY|683": "5TW",
    "BY|838": "88D",
    "BY|839": "41H",
    "BY|851": "7JB",
    "BY|858": "4BL",
    "BY|859": "7MT",
    "DS|1277": "26LA",
    "DS|1278": "1DV",
    "DS|1567": "12DC",
    "DS|1568": "81DV",
    "EZS|1277": "26LA",
    "EZS|1278": "1DV",
    "EZS|1567": "12DC",
    "EZS|1568": "81DV",
    "EZY|2275": "73GW",
    "EZY|2276": "52TN",
    "EZY|2281": "53JD",
    "EZY|2282": "68YJ",
    "EZY|2639": "25UE",
    "EZY|2640": "61KH",
    "EZY|2641": "13HY",
    "EZY|2642": "54UB",
    "EZY|2791": "91HA",
    "EZY|2792": "12KM",
    "EZY|2794": "12KM",
    "EZY|3171": "93AX",
    "EZY|3172": "93AX",
    "EZY|3329": "73CA",
    "EZY|3330": "73CA",
    "EZY|3491": "92XM",
    "EZY|3492": "92XM",
    "EZY|5623": "87RK",
    "EZY|5624": "39GY",
    "EZY|6617": "15MX",
    "EZY|6618": "76RK",
    "EZY|8845": "69RJ",
    "EZY|8846": "47JF",
    "EZY|8847": "78ML",
    "EZY|8848": "63JT",
    "EZY|8853": "61ZF",
    "EZY|8854": "21XG",
    "H3|112": "5GH",
    "H3|113": "5AF",
    "H3|201": "5AG",
    "H3|202": "5BC",
    "NO|1432": "68EP",
    "NO|1780": "80RF",
    "OR|3621": "3KA",
    "OR|3622": "5PK",
    "OR|3623": "43H",
    "OR|3624": "7TA",
    "OR|3625": "68N",
    "OR|3626": "2EH",
    "TB|2711": "1DY",
    "TB|2751": "2YX",
    "TB|2752": "7PN",
    "TFL|3621": "3KA",
    "TFL|3622": "5PK",
    "TFL|3623": "43H",
    "TFL|3624": "7TA",
    "TFL|3625": "68N",
    "TFL|3626": "2EH",
    "TOM|229": "3AY",
    "TOM|262": "8LK",
    "TOM|468": "7NX",
    "TOM|474": "5PV",
    "TOM|475": "3WL",
    "TOM|528": "16N",
    "TOM|588": "24E",
    "TOM|589": "5EN",
    "TOM|612": "4YW",
    "TOM|682": "9JL",
    "TOM|683": "5TW",
    "TOM|838": "88D",
    "TOM|839": "41H",
    "TOM|851": "7JB",
    "TOM|858": "4BL",
    "TOM|859": "7MT"
  });

  const els = {
    dropZone: document.getElementById("dropZone"),
    fileInput: document.getElementById("fileInput"),
    fileName: document.getElementById("fileName"),
    convertButton: document.getElementById("convertButton"),
    resetButton: document.getElementById("resetButton"),
    status: document.getElementById("status"),
    flightCount: document.getElementById("flightCount"),
    reportDate: document.getElementById("reportDate"),
    arrivalCount: document.getElementById("arrivalCount"),
    departureCount: document.getElementById("departureCount"),
    outputName: document.getElementById("outputName"),
    previewBody: document.getElementById("previewBody")
  };

  const state = {
    file: null,
    parsed: null
  };

  function setStatus(message, kind = "") {
    els.status.textContent = message;
    els.status.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function dateKey(value) {
    return window.DTNH_AFMS_FLIGHT_PROGRAM.dateKey(value);
  }

  function displayDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
    const [year, month, day] = isoDate.split("-");
    return `${day}.${month}.${year}`;
  }

  function outputName(isoDate) {
    return `NBE ${displayDate(isoDate)}.xlsx`;
  }

  function clock(value) {
    const text = String(value || "");
    const match = text.match(/T(\d{2}):(\d{2})/) || text.match(/\b(\d{1,2}):(\d{2})\b/);
    return match ? `${pad2(match[1])}:${match[2]}` : "";
  }

  function airportText(value) {
    return String(value || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  }

  function compactFlight(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function rowText(row) {
    return row.map(value => String(value || "").trim()).filter(Boolean).join(" ");
  }

  function cancelledFlightMatcher(row) {
    const text = rowText(row).toUpperCase();
    if (!/\bFCL\b/.test(text)) return null;
    return compactFlight(text);
  }

  function filterCancelledFlights(parsed, rows) {
    const cancellationRows = rows.map(cancelledFlightMatcher).filter(Boolean);
    if (!cancellationRows.length) return { parsed, removed: [] };
    const removed = [];
    const flights = parsed.flights.filter(flight => {
      const candidates = [flight.departureFlight, flight.arrivalFlight]
        .map(compactFlight)
        .filter(Boolean);
      const isCancelled = candidates.some(candidate => cancellationRows.some(row => row.includes(candidate)));
      if (isCancelled) removed.push(flight);
      return !isCancelled;
    });
    return {
      parsed: {
        ...parsed,
        flights,
        cancelledFlights: removed
      },
      removed
    };
  }

  function cellValue(value) {
    if (value == null) return "";
    if (value instanceof Date) return value;
    if (typeof value !== "object") return value;
    if (value.result !== undefined) return cellValue(value.result);
    if (value.text !== undefined) return cellValue(value.text);
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || "").join("");
    return String(value);
  }

  function worksheetRows(worksheet) {
    const rows = Array.from({ length: worksheet.rowCount }, () => []);
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells = Array.from({ length: worksheet.columnCount }, () => "");
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellValue(cell.value);
      });
      rows[rowNumber - 1] = cells;
    });
    return rows;
  }

  function splitFlight(value) {
    const match = String(value || "").trim().toUpperCase().match(/^([A-Z0-9]+)\s*(.*)$/);
    if (!match) return { carrier: "", icao: "", number: "" };
    const carrier = match[1];
    const icao = ICAO_BY_CARRIER[carrier] || carrier;
    const compactNumber = match[2].replace(/\s+/g, "");
    const [baseNumber, existingSuffix] = compactNumber.split("/");
    const mappedSuffix = FLIGHT_SUFFIX_BY_KEY[`${carrier}|${baseNumber}`] || FLIGHT_SUFFIX_BY_KEY[`${icao}|${baseNumber}`] || "";
    const suffix = existingSuffix || mappedSuffix;
    return {
      carrier,
      icao,
      number: suffix ? `${baseNumber}/${suffix}` : baseNumber
    };
  }

  function timeMinutes(value) {
    const text = clock(value);
    if (!text) return Number.POSITIVE_INFINITY;
    const [hours, minutes] = text.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function sortFlightsBySta(flights) {
    return [...flights].sort((left, right) => {
      const staDiff = timeMinutes(left.sta) - timeMinutes(right.sta);
      if (staDiff) return staDiff;
      const stdDiff = timeMinutes(left.std) - timeMinutes(right.std);
      if (stdDiff) return stdDiff;
      return String(left.arrivalFlight || left.departureFlight || "").localeCompare(String(right.arrivalFlight || right.departureFlight || ""));
    });
  }

  function findRemarksRow(worksheet) {
    for (let row = START_ROW; row <= worksheet.rowCount; row += 1) {
      const value = String(worksheet.getCell(row, 2).value || "").trim().toUpperCase();
      if (value.startsWith("REMARKS")) return row;
    }
    return START_ROW + TEMPLATE_CAPACITY + BLANK_ROWS_BEFORE_REMARKS;
  }

  function cloneStyle(source, target) {
    target.style = JSON.parse(JSON.stringify(source.style || {}));
    target.numFmt = source.numFmt;
    target.alignment = source.alignment ? { ...source.alignment } : undefined;
    target.border = source.border ? JSON.parse(JSON.stringify(source.border)) : undefined;
    target.fill = source.fill ? JSON.parse(JSON.stringify(source.fill)) : undefined;
    target.font = source.font ? { ...source.font } : undefined;
  }

  function prepareTemplateRows(worksheet, flightCount) {
    const requiredRows = Math.max(flightCount, 1);
    if (requiredRows > TEMPLATE_CAPACITY) {
      const extraRows = requiredRows - TEMPLATE_CAPACITY;
      const insertAt = START_ROW + TEMPLATE_CAPACITY;
      worksheet.spliceRows(insertAt, 0, ...Array.from({ length: extraRows }, () => []));
      for (let row = insertAt; row < insertAt + extraRows; row += 1) {
        worksheet.getRow(row).height = worksheet.getRow(insertAt - 1).height;
        for (let col = 1; col <= 17; col += 1) {
          cloneStyle(worksheet.getCell(insertAt - 1, col), worksheet.getCell(row, col));
        }
      }
    }
  }

  function clearFlightArea(worksheet, rowsToClear) {
    for (let row = START_ROW; row < START_ROW + rowsToClear; row += 1) {
      for (let col = 2; col <= 17; col += 1) {
        worksheet.getCell(row, col).value = null;
      }
    }
  }

  function setFlightRow(worksheet, rowNumber, flight) {
    const arrival = splitFlight(flight.arrivalFlight);
    const departure = splitFlight(flight.departureFlight);
    const values = [
      arrival.carrier,
      arrival.icao,
      arrival.number,
      airportText(flight.origin),
      clock(flight.sta),
      null,
      flight.aircraft || flight.aircraftType || "",
      flight.parkingPosition || flight.gate || null,
      departure.carrier,
      departure.icao,
      departure.number,
      airportText(flight.destination),
      clock(flight.std),
      flight.gate || flight.parkingPosition || null,
      null,
      null
    ];
    values.forEach((value, index) => {
      worksheet.getCell(rowNumber, index + 2).value = value === "" ? null : value;
    });
  }

  function cleanRemarksBlock(worksheet, flightCount) {
    const remarksRow = START_ROW + Math.max(flightCount, TEMPLATE_CAPACITY) + BLANK_ROWS_BEFORE_REMARKS;
    for (let row = remarksRow; row <= remarksRow + 2; row += 1) {
      for (let col = 2; col <= 17; col += 1) {
        worksheet.getCell(row, col).value = null;
      }
    }
    try {
      worksheet.unMergeCells(`B${remarksRow}:D${remarksRow}`);
    } catch (_) {
      // The template may already be unmerged after row insertion.
    }
    try {
      worksheet.mergeCells(`B${remarksRow}:D${remarksRow}`);
    } catch (_) {
      // If ExcelJS already considers the range merged, writing B is enough.
    }
    const remarksCell = worksheet.getCell(`B${remarksRow}`);
    remarksCell.value = "Remarks / Details";
    remarksCell.font = { ...(remarksCell.font || {}), bold: true };
    remarksCell.alignment = { vertical: "middle", horizontal: "left" };
  }

  async function parseAfms(file) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet("pair_report") || workbook.worksheets[0];
    if (!worksheet) throw new Error("The AFMS workbook has no worksheet.");
    const rows = worksheetRows(worksheet).filter(row => {
      const joined = rowText(row).toUpperCase();
      return joined && !joined.includes("PAGE 1 OF");
    });
    const parsed = filterCancelledFlights(window.DTNH_AFMS_FLIGHT_PROGRAM.parsePairReport(rows), rows).parsed;
    if (parsed.conflictingDuplicates) throw new Error(`${parsed.conflictingDuplicates} conflicting duplicate flight rows were found.`);
    if (!parsed.flights.length) throw new Error("No valid paired AFMS departures were found.");

    const flights = sortFlightsBySta(parsed.flights);
    const dates = [...new Set(flights.map(flight => dateKey(flight.std)).filter(Boolean))].sort();
    if (dates.length !== 1) throw new Error(`Upload one AFMS day only. This file contains ${dates.join(", ")}.`);
    return { ...parsed, flights, reportDate: dates[0] };
  }

  async function buildWorkbook(parsed) {
    const response = await fetch(TEMPLATE_PATH);
    if (!response.ok) throw new Error("The NBE template workbook could not be loaded.");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    prepareTemplateRows(worksheet, parsed.flights.length);

    const rowsToClear = Math.max(parsed.flights.length, TEMPLATE_CAPACITY);
    clearFlightArea(worksheet, rowsToClear);
    worksheet.getCell("E5").value = AIRPORT;
    worksheet.getCell("E6").value = displayDate(parsed.reportDate);
    worksheet.getCell("E7").value = parsed.flights.filter(flight => flight.arrivalFlight).length;
    worksheet.getCell("M7").value = parsed.flights.length;
    worksheet.getCell("B8").value = "ARRIVAL";
    worksheet.getCell("J8").value = "DEPARTURE  ";

    parsed.flights.forEach((flight, index) => {
      setFlightRow(worksheet, START_ROW + index, flight);
    });
    cleanRemarksBlock(worksheet, parsed.flights.length);
    worksheet.views = [{ showGridLines: false }];
    return workbook.xlsx.writeBuffer();
  }

  function download(buffer, name) {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderPreview(parsed) {
    const arrivals = parsed.flights.filter(flight => flight.arrivalFlight).length;
    els.flightCount.textContent = `${parsed.flights.length} flight${parsed.flights.length === 1 ? "" : "s"}`;
    els.reportDate.textContent = displayDate(parsed.reportDate);
    els.arrivalCount.textContent = arrivals;
    els.departureCount.textContent = parsed.flights.length;
    els.outputName.textContent = outputName(parsed.reportDate);
    els.previewBody.innerHTML = "";
    for (const flight of parsed.flights) {
      const row = document.createElement("tr");
      [flight.arrivalFlight, clock(flight.sta), airportText(flight.origin), flight.departureFlight, clock(flight.std), airportText(flight.destination), flight.aircraft || flight.aircraftType || ""].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value || "-";
        row.appendChild(cell);
      });
      els.previewBody.appendChild(row);
    }
  }

  async function handleFile(file) {
    state.file = file;
    state.parsed = null;
    els.fileName.textContent = file.name;
    els.convertButton.disabled = true;
    els.resetButton.disabled = false;
    setStatus("Reading AFMS workbook...");
    try {
      const parsed = await parseAfms(file);
      state.parsed = parsed;
      renderPreview(parsed);
      els.convertButton.disabled = false;
      const notes = [];
      if (parsed.cancelledFlights?.length) {
        notes.push(`${parsed.cancelledFlights.length} FCL cancelled flight${parsed.cancelledFlights.length === 1 ? "" : "s"} removed.`);
      }
      if (parsed.duplicateRows || parsed.discardedRows) {
        notes.push(`${parsed.duplicateRows} duplicate rows and ${parsed.discardedRows} incomplete rows were ignored.`);
      }
      notes.push("Belt, chute, and check-in columns are left blank because AFMS does not provide them.");
      setStatus(`Ready to create the NBE workbook. ${notes.join(" ")}`, parsed.cancelledFlights?.length || parsed.discardedRows || parsed.duplicateRows ? "warn" : "ok");
    } catch (error) {
      setStatus(error.message || String(error), "error");
    }
  }

  function reset() {
    state.file = null;
    state.parsed = null;
    els.fileInput.value = "";
    els.fileName.textContent = "No file selected";
    els.convertButton.disabled = true;
    els.resetButton.disabled = true;
    els.flightCount.textContent = "0 flights";
    els.reportDate.textContent = "-";
    els.arrivalCount.textContent = "-";
    els.departureCount.textContent = "-";
    els.outputName.textContent = "-";
    els.previewBody.innerHTML = '<tr><td colspan="7" class="empty">No preview yet.</td></tr>';
    setStatus("Waiting for an AFMS workbook.");
  }

  els.fileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
  });

  els.convertButton.addEventListener("click", async () => {
    if (!state.parsed) return;
    els.convertButton.disabled = true;
    setStatus("Creating NBE workbook...");
    try {
      const buffer = await buildWorkbook(state.parsed);
      download(buffer, outputName(state.parsed.reportDate));
      setStatus(`Downloaded ${outputName(state.parsed.reportDate)}.`, "ok");
    } catch (error) {
      setStatus(error.message || String(error), "error");
    } finally {
      els.convertButton.disabled = false;
    }
  });

  els.resetButton.addEventListener("click", reset);

  ["dragenter", "dragover"].forEach(type => {
    els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach(type => {
    els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragover");
    });
  });

  els.dropZone.addEventListener("drop", event => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
})();
