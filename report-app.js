(function () {
  "use strict";
  const ids = ["dailyTab", "reportTab", "dailyView", "reportView", "reportDropZone", "reportFileInput", "reportFileName", "reportConvertButton", "reportResetButton", "reportStatus", "reportPairCount", "reportPeriod", "reportMatched", "reportUnmatched", "reportOutputName", "reportPreviewBody"];
  const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const state = { parsed: null, file: null };
  const formatDate = date => `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
  const formatTime = date => date ? `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "";
  const name = parsed => `Paired Flight Report ${formatDate(parsed.firstDate)}-${formatDate(parsed.lastDate)}.xlsx`;

  function select(view) {
    const report = view === "report";
    el.dailyView.hidden = report;
    el.reportView.hidden = !report;
    el.dailyTab.classList.toggle("active", !report);
    el.reportTab.classList.toggle("active", report);
    el.dailyTab.setAttribute("aria-selected", String(!report));
    el.reportTab.setAttribute("aria-selected", String(report));
  }

  function status(message, kind = "") {
    el.reportStatus.textContent = message;
    el.reportStatus.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function render(parsed) {
    el.reportPairCount.textContent = `${parsed.pairs.length} rows`;
    el.reportPeriod.textContent = `${formatDate(parsed.firstDate)} - ${formatDate(parsed.lastDate)}`;
    el.reportMatched.textContent = parsed.matched;
    el.reportUnmatched.textContent = parsed.unmatched;
    el.reportOutputName.textContent = name(parsed);
    el.reportPreviewBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const pair of parsed.pairs) {
      const row = document.createElement("tr");
      if (pair.status === "Unmatched") row.className = "unmatched-row";
      const cells = [
        (pair.arrival || pair.departure).code,
        pair.arrival ? `${pair.arrival.code} ${pair.arrival.number}` : "",
        formatTime(pair.arrival?.date),
        pair.arrival?.stationCode?.split(/\s+/)[0] || "",
        pair.departure ? `${pair.departure.code} ${pair.departure.number}` : "",
        formatTime(pair.departure?.date),
        pair.departure?.stationCode?.trim().split(/\s+/).at(-1) || "",
        pair.status
      ];
      for (const content of cells) {
        const cell = document.createElement("td");
        cell.textContent = content || "-";
        row.appendChild(cell);
      }
      fragment.appendChild(row);
    }
    el.reportPreviewBody.appendChild(fragment);
  }

  async function handleFile(file) {
    state.file = file;
    state.parsed = null;
    el.reportFileName.textContent = file.name;
    el.reportConvertButton.disabled = true;
    el.reportResetButton.disabled = false;
    status("Reading report...");
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      if (!workbook.worksheets.length) throw new Error("The workbook has no worksheet.");
      const parsed = window.DTNH_REPORT_CONVERTER.parseWorksheet(workbook.worksheets[0]);
      state.parsed = parsed;
      render(parsed);
      el.reportConvertButton.disabled = false;
      status(`${parsed.flightCount} flights arranged in ${parsed.pairs.length} rows. ${parsed.unmatched} unmatched flights remain visible.`, parsed.unmatched ? "warn" : "ok");
    } catch (error) {
      status(error.message || String(error), "error");
    }
  }

  function reset() {
    state.file = null;
    state.parsed = null;
    el.reportFileInput.value = "";
    el.reportFileName.textContent = "No file selected";
    el.reportConvertButton.disabled = true;
    el.reportResetButton.disabled = true;
    el.reportPairCount.textContent = "0 rows";
    for (const id of ["reportPeriod", "reportMatched", "reportUnmatched", "reportOutputName"]) el[id].textContent = "-";
    el.reportPreviewBody.innerHTML = '<tr><td colspan="8" class="empty">No preview yet.</td></tr>';
    status("Waiting for an ExportResults workbook.");
  }

  el.dailyTab.addEventListener("click", () => select("daily"));
  el.reportTab.addEventListener("click", () => select("report"));
  el.reportFileInput.addEventListener("change", event => { if (event.target.files?.[0]) handleFile(event.target.files[0]); });
  el.reportResetButton.addEventListener("click", reset);
  el.reportConvertButton.addEventListener("click", async () => {
    if (!state.parsed) return;
    el.reportConvertButton.disabled = true;
    status("Creating paired report...");
    try {
      const workbook = window.DTNH_REPORT_CONVERTER.buildWorkbook(state.parsed, ExcelJS);
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name(state.parsed);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(`Downloaded ${name(state.parsed)}.`, "ok");
    } catch (error) {
      status(error.message || String(error), "error");
    } finally {
      el.reportConvertButton.disabled = false;
    }
  });
  for (const type of ["dragenter", "dragover"]) el.reportDropZone.addEventListener(type, event => {
    event.preventDefault();
    el.reportDropZone.classList.add("is-dragover");
  });
  for (const type of ["dragleave", "drop"]) el.reportDropZone.addEventListener(type, event => {
    event.preventDefault();
    el.reportDropZone.classList.remove("is-dragover");
  });
  el.reportDropZone.addEventListener("drop", event => { if (event.dataTransfer?.files?.[0]) handleFile(event.dataTransfer.files[0]); });
})();
