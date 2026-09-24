(function exposeAfmsFlightProgram(global) {
  "use strict";

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function unwrapCell(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date || typeof value !== "object") return value;
    if (value.result !== undefined) return unwrapCell(value.result);
    if (value.text !== undefined) return unwrapCell(value.text);
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || "").join("");
    return String(value);
  }

  function parseDateTime(value) {
    const cell = unwrapCell(value);
    if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : new Date(cell);
    if (typeof cell === "number" && Number.isFinite(cell)) {
      const wholeDays = Math.floor(cell);
      const dayFraction = cell - wholeDays;
      const totalSeconds = Math.round(dayFraction * 24 * 60 * 60);
      const date = new Date(1899, 11, 30 + wholeDays, 0, 0, totalSeconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const text = String(cell || "").trim();
    if (!text) return null;
    const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dayFirst) {
      const yearValue = Number(dayFirst[3]);
      const date = new Date(
        yearValue < 100 ? 2000 + yearValue : yearValue,
        Number(dayFirst[2]) - 1,
        Number(dayFirst[1]),
        Number(dayFirst[4] || 0),
        Number(dayFirst[5] || 0),
        Number(dayFirst[6] || 0)
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const isoLocal = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoLocal) {
      const date = new Date(
        Number(isoLocal[1]),
        Number(isoLocal[2]) - 1,
        Number(isoLocal[3]),
        Number(isoLocal[4] || 0),
        Number(isoLocal[5] || 0),
        Number(isoLocal[6] || 0)
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function dateKey(value) {
    const date = parseDateTime(value);
    if (!date) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function localIsoMinute(value) {
    const date = parseDateTime(value);
    if (!date) return "";
    return `${dateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;
  }

  function operationalWeekStart(value) {
    const date = parseDateTime(value);
    if (!date) return "";
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0, 0, 0);
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    if (date < start) start.setDate(start.getDate() - 7);
    return localIsoMinute(start);
  }

  function addDaysKeepingTime(value, amount) {
    const date = parseDateTime(value);
    if (!date) return null;
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function addDays(value, amount) {
    const date = parseDateTime(value);
    if (!date) return null;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function tomorrowDateKey(now = new Date(), timeZone = "Africa/Tunis") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    const localToday = new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
    return dateKey(addDays(localToday, 1));
  }

  function normalizeText(value) {
    return String(unwrapCell(value) || "").trim().replace(/\s+/g, " ");
  }

  function normalizeFlightNumber(value) {
    return normalizeText(value).toUpperCase();
  }

  function normalizeHeader(value) {
    return normalizeText(value).toUpperCase().replace(/\s+/g, " ");
  }

  function airlineFromFlight(value) {
    const compact = normalizeFlightNumber(value).replace(/\s+/g, "");
    return compact.match(/^([A-Z]{2,3}|[A-Z]\d|\d[A-Z])(?=\d)/)?.[1] || "UNKNOWN";
  }

  function stableHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).toUpperCase();
  }

  function findHeaderRow(rows) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
      const headers = (rows[index] || []).map(normalizeHeader);
      const flightColumns = headers.map((header, column) => header === "FLIGHT" ? column : -1).filter(column => column >= 0);
      if (flightColumns.length >= 2 && headers.includes("STA") && headers.includes("STD")) return index;
    }
    return -1;
  }

  function firstColumn(headers, aliases, startAt = 0) {
    const names = new Set(aliases.map(normalizeHeader));
    for (let index = Math.max(0, startAt); index < headers.length; index += 1) {
      if (names.has(headers[index])) return index;
    }
    return -1;
  }

  function reportCoverage(rows, importedDates) {
    const headerDates = [];
    for (const row of rows.slice(0, 6)) {
      for (const value of row || []) {
        const parsed = parseDateTime(value);
        if (parsed && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2100) headerDates.push(parsed);
      }
    }
    headerDates.sort((a, b) => a - b);
    const uniqueHeaderDates = headerDates.filter((date, index) => !index || dateKey(date) !== dateKey(headerDates[index - 1]));
    const sortedImportedDates = [...new Set(importedDates.filter(Boolean))].sort();
    const importedStart = sortedImportedDates[0] || "";
    const importedEnd = sortedImportedDates[sortedImportedDates.length - 1] || "";
    const reportStart = uniqueHeaderDates.length >= 2 ? dateKey(uniqueHeaderDates[0]) : importedStart;
    const reportEndExclusive = uniqueHeaderDates.length >= 2 ? uniqueHeaderDates[uniqueHeaderDates.length - 1] : null;
    const reportEnd = reportEndExclusive && reportStart && dateKey(reportEndExclusive) > reportStart
      ? dateKey(addDays(reportEndExclusive, -1))
      : importedEnd;
    return {
      start: reportStart && (!importedStart || reportStart <= importedStart) ? reportStart : importedStart,
      end: [reportEnd, importedEnd].filter(Boolean).sort().pop() || "",
      reportEndExclusive: reportEndExclusive ? dateKey(reportEndExclusive) : ""
    };
  }

  function flightIdentity(flight) {
    const operationDate = dateKey(flight.std || flight.departureTime || flight.sta || flight.arrivalTime);
    const departureFlight = normalizeFlightNumber(flight.departureFlight || flight.flight || flight.depFlight);
    return operationDate && departureFlight ? `${operationDate}|${departureFlight.replace(/[^A-Z0-9]/g, "")}` : "";
  }

  function flightFingerprint(flight) {
    return JSON.stringify({
      arrivalFlight: normalizeFlightNumber(flight.arrivalFlight),
      departureFlight: normalizeFlightNumber(flight.departureFlight || flight.flight),
      sta: localIsoMinute(flight.sta || flight.arrivalTime),
      std: localIsoMinute(flight.std || flight.departureTime),
      origin: normalizeText(flight.origin).toUpperCase(),
      destination: normalizeText(flight.destination).toUpperCase(),
      aircraft: normalizeText(flight.aircraft || flight.aircraftType).toUpperCase(),
      registration: normalizeText(flight.registration).toUpperCase(),
      gate: normalizeText(flight.gate).toUpperCase(),
      parkingPosition: normalizeText(flight.parkingPosition || flight.stand).toUpperCase()
    });
  }

  function importedFlightId(flight) {
    const identity = flightIdentity(flight);
    const readable = identity.replace(/[^A-Z0-9]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `AFMS-${readable || stableHash(flightFingerprint(flight))}`;
  }

  function parsePairReport(rows = []) {
    const normalizedRows = Array.isArray(rows) ? rows.map(row => Array.isArray(row) ? row.map(unwrapCell) : []) : [];
    const headerRowIndex = findHeaderRow(normalizedRows);
    if (headerRowIndex < 0) throw new Error("This workbook does not contain a recognizable AFMS pair_report header.");
    const headers = normalizedRows[headerRowIndex].map(normalizeHeader);
    const flightColumns = headers.map((header, column) => header === "FLIGHT" ? column : -1).filter(column => column >= 0);
    const arrivalFlightColumn = flightColumns[0];
    const departureFlightColumn = flightColumns[flightColumns.length - 1];
    const staColumn = firstColumn(headers, ["STA"], arrivalFlightColumn);
    const stdColumn = firstColumn(headers, ["STD"], departureFlightColumn);
    const originColumn = firstColumn(headers, ["ORG", "ORIGIN"], arrivalFlightColumn);
    const destinationColumn = firstColumn(headers, ["DEST", "DESTINATION"], departureFlightColumn);
    const aircraftColumn = firstColumn(headers, ["A/T", "AIRCRAFT", "TYPE"], departureFlightColumn);
    const registrationColumn = firstColumn(headers, ["REG.NO", "REG", "REGISTRATION"], departureFlightColumn);
    const gateColumn = firstColumn(headers, ["GATE"], departureFlightColumn);
    const standColumn = firstColumn(headers, ["STAND", "PARKING"], departureFlightColumn);
    const flightsByIdentity = new Map();
    let discardedRows = 0;
    let duplicateRows = 0;
    let conflictingDuplicates = 0;

    for (const row of normalizedRows.slice(headerRowIndex + 1)) {
      const departureFlight = normalizeFlightNumber(row[departureFlightColumn]);
      const std = localIsoMinute(row[stdColumn]);
      if (!departureFlight && !normalizeText(row[stdColumn])) continue;
      if (!departureFlight || !std) {
        discardedRows += 1;
        continue;
      }
      const aircraft = normalizeText(row[aircraftColumn]).toUpperCase();
      const flight = {
        arrivalFlight: normalizeFlightNumber(row[arrivalFlightColumn]),
        departureFlight,
        sta: localIsoMinute(row[staColumn]),
        std,
        origin: normalizeText(row[originColumn]).toUpperCase(),
        destination: normalizeText(row[destinationColumn]).toUpperCase(),
        airline: airlineFromFlight(departureFlight),
        aircraft,
        aircraftType: aircraft,
        registration: normalizeText(row[registrationColumn]).toUpperCase(),
        gate: normalizeText(row[gateColumn]).toUpperCase(),
        parkingPosition: normalizeText(row[standColumn]).toUpperCase(),
        source: "AFMS pair_report"
      };
      flight.id = importedFlightId(flight);
      flight.flightId = flight.id;
      const identity = flightIdentity(flight);
      const existing = flightsByIdentity.get(identity);
      if (existing) {
        duplicateRows += 1;
        if (flightFingerprint(existing) !== flightFingerprint(flight)) conflictingDuplicates += 1;
        continue;
      }
      flightsByIdentity.set(identity, flight);
    }

    const flights = [...flightsByIdentity.values()].sort((a, b) => String(a.std).localeCompare(String(b.std)));
    const coverage = reportCoverage(normalizedRows, flights.map(flight => dateKey(flight.std)));
    return { flights, coverage, headerRowIndex, discardedRows, duplicateRows, conflictingDuplicates };
  }

  function serializeFlight(flight) {
    const aircraft = normalizeText(flight.aircraft || flight.aircraftType).toUpperCase();
    const id = flight.id || flight.flightId || importedFlightId(flight);
    return Object.fromEntries(Object.entries({
      id,
      arrivalFlight: normalizeFlightNumber(flight.arrivalFlight),
      departureFlight: normalizeFlightNumber(flight.departureFlight || flight.flight),
      sta: localIsoMinute(flight.sta || flight.arrivalTime),
      std: localIsoMinute(flight.std || flight.departureTime),
      origin: normalizeText(flight.origin).toUpperCase(),
      destination: normalizeText(flight.destination).toUpperCase(),
      airline: normalizeText(flight.airline || airlineFromFlight(flight.departureFlight || flight.flight)).toUpperCase(),
      aircraft,
      registration: normalizeText(flight.registration).toUpperCase(),
      gate: normalizeText(flight.gate).toUpperCase(),
      parkingPosition: normalizeText(flight.parkingPosition || flight.stand).toUpperCase()
    }).filter(([, value]) => value !== ""));
  }

  function prepareUpdate({ existingFlights = [], parsedReport, firstMutableDate } = {}) {
    const report = parsedReport || { flights: [], coverage: {}, discardedRows: 0, duplicateRows: 0, conflictingDuplicates: 0 };
    const coverageStart = report.coverage?.start || "";
    const coverageEnd = report.coverage?.end || "";
    const mutableStart = [coverageStart, dateKey(firstMutableDate)].filter(Boolean).sort().pop() || coverageStart;
    const blockers = [];
    const warnings = [];
    if (!report.flights?.length) blockers.push("No valid paired departures were found in the AFMS report.");
    if (!coverageStart || !coverageEnd) blockers.push("The AFMS report date coverage could not be determined.");
    if (coverageEnd && mutableStart && coverageEnd < mutableStart) blockers.push("This report contains no dates after the protected current week.");
    if (report.conflictingDuplicates) blockers.push(`${report.conflictingDuplicates} conflicting duplicate flight row${report.conflictingDuplicates === 1 ? " was" : "s were"} found.`);
    if (report.duplicateRows && !report.conflictingDuplicates) warnings.push(`${report.duplicateRows} repeated row${report.duplicateRows === 1 ? " was" : "s were"} safely deduplicated.`);
    if (report.discardedRows) warnings.push(`${report.discardedRows} incomplete row${report.discardedRows === 1 ? " was" : "s were"} ignored.`);

    const imported = (report.flights || []).map(serializeFlight).filter(flight => {
      const key = dateKey(flight.std);
      return key && (!mutableStart || key >= mutableStart) && (!coverageEnd || key <= coverageEnd);
    });
    const protectedSkipped = (report.flights || []).length - imported.length;
    const existing = (Array.isArray(existingFlights) ? existingFlights : []).map(serializeFlight).filter(flight => flightIdentity(flight));
    const existingInRange = existing.filter(flight => {
      const key = dateKey(flight.std);
      return key >= mutableStart && key <= coverageEnd;
    });
    const retained = existing.filter(flight => {
      const key = dateKey(flight.std);
      return key < mutableStart || key > coverageEnd;
    });
    const oldByIdentity = new Map(existingInRange.map(flight => [flightIdentity(flight), flight]));
    const importedByIdentity = new Map(imported.map(flight => [flightIdentity(flight), flight]));
    let added = 0;
    let changed = 0;
    let unchanged = 0;
    for (const [identity, flight] of importedByIdentity) {
      const old = oldByIdentity.get(identity);
      if (!old) added += 1;
      else {
        if (old.id) flight.id = old.id;
        if (flightFingerprint(old) === flightFingerprint(flight)) unchanged += 1;
        else changed += 1;
      }
    }
    const removed = [...oldByIdentity.keys()].filter(identity => !importedByIdentity.has(identity)).length;
    const flights = [...retained, ...importedByIdentity.values()].sort((a, b) => String(a.std).localeCompare(String(b.std)));
    const byteSize = new TextEncoder().encode(JSON.stringify(flights)).length;
    if (byteSize > 820000) blockers.push(`The merged flight program is ${Math.ceil(byteSize / 1024)} KB and is too large for safe cloud storage.`);
    if (!imported.length && !blockers.length) blockers.push("No imported flights remain after protecting today and earlier dates.");
    return {
      flights,
      importedFlights: imported,
      blockers,
      warnings,
      coverageStart,
      coverageEnd,
      effectiveStart: mutableStart,
      effectiveEnd: coverageEnd,
      protectedSkipped,
      stats: { added, changed, removed, unchanged, imported: imported.length, retained: retained.length, total: flights.length, byteSize }
    };
  }

  function prepareOperationalWeekUpdate({ existingFlights = [], parsedReport, weekStart } = {}) {
    const report = parsedReport || { flights: [], coverage: {}, discardedRows: 0, duplicateRows: 0, conflictingDuplicates: 0 };
    const importedSource = Array.isArray(report.flights) ? report.flights : [];
    const inferredStart = weekStart ? localIsoMinute(weekStart) : operationalWeekStart(importedSource[0]?.std);
    const effectiveEnd = inferredStart ? localIsoMinute(addDaysKeepingTime(inferredStart, 7)) : "";
    const blockers = [];
    const warnings = [];
    if (!importedSource.length) blockers.push("No valid paired departures were found in the AFMS report.");
    if (!inferredStart || !effectiveEnd) blockers.push("The operational week could not be determined. Use a complete Monday 08:00 to next Monday 08:00 AFMS report.");
    if (report.conflictingDuplicates) blockers.push(`${report.conflictingDuplicates} conflicting duplicate flight row${report.conflictingDuplicates === 1 ? " was" : "s were"} found.`);
    if (report.duplicateRows && !report.conflictingDuplicates) warnings.push(`${report.duplicateRows} repeated row${report.duplicateRows === 1 ? " was" : "s were"} safely deduplicated.`);
    if (report.discardedRows) warnings.push(`${report.discardedRows} incomplete row${report.discardedRows === 1 ? " was" : "s were"} ignored.`);

    const imported = importedSource.map(serializeFlight).filter(flight => {
      const std = localIsoMinute(flight.std);
      return std && inferredStart && effectiveEnd && std >= inferredStart && std < effectiveEnd;
    });
    const outsideWindow = importedSource.length - imported.length;
    if (outsideWindow) blockers.push(`${outsideWindow} departure${outsideWindow === 1 ? " is" : "s are"} outside the ${inferredStart} to ${effectiveEnd} operational week. Upload exactly one complete week.`);

    const existing = (Array.isArray(existingFlights) ? existingFlights : []).map(serializeFlight).filter(flight => flightIdentity(flight));
    const existingInRange = existing.filter(flight => {
      const std = localIsoMinute(flight.std);
      return std >= inferredStart && std < effectiveEnd;
    });
    const retained = existing.filter(flight => {
      const std = localIsoMinute(flight.std);
      return std < inferredStart || std >= effectiveEnd;
    });
    const oldByIdentity = new Map(existingInRange.map(flight => [flightIdentity(flight), flight]));
    const importedByIdentity = new Map(imported.map(flight => [flightIdentity(flight), flight]));
    let added = 0;
    let changed = 0;
    let unchanged = 0;
    for (const [identity, flight] of importedByIdentity) {
      const old = oldByIdentity.get(identity);
      if (!old) added += 1;
      else {
        if (old.id) flight.id = old.id;
        if (flightFingerprint(old) === flightFingerprint(flight)) unchanged += 1;
        else changed += 1;
      }
    }
    const removed = [...oldByIdentity.keys()].filter(identity => !importedByIdentity.has(identity)).length;
    const flights = [...retained, ...importedByIdentity.values()].sort((a, b) => String(a.std).localeCompare(String(b.std)));
    const byteSize = new TextEncoder().encode(JSON.stringify(flights)).length;
    if (byteSize > 820000) blockers.push(`The merged flight program is ${Math.ceil(byteSize / 1024)} KB and is too large for safe cloud storage.`);
    if (!imported.length && !blockers.length) blockers.push("No imported departures remain inside the operational week.");
    return {
      flights,
      importedFlights: imported,
      blockers,
      warnings,
      coverageStart: inferredStart,
      coverageEnd: effectiveEnd,
      effectiveStart: inferredStart,
      effectiveEnd,
      protectedSkipped: outsideWindow,
      outsideWindow,
      stats: { added, changed, removed, unchanged, imported: imported.length, retained: retained.length, total: flights.length, byteSize }
    };
  }

  const api = Object.freeze({
    dateKey,
    flightFingerprint,
    flightIdentity,
    importedFlightId,
    localIsoMinute,
    operationalWeekStart,
    parseDateTime,
    parsePairReport,
    prepareOperationalWeekUpdate,
    prepareUpdate,
    serializeFlight,
    tomorrowDateKey
  });
  global.DTNH_AFMS_FLIGHT_PROGRAM = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
