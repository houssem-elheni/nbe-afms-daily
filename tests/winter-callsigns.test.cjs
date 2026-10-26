const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({
  document: { getElementById: () => ({ addEventListener() {} }) }
});
vm.runInContext("globalThis.window = globalThis;", context);
vm.runInContext(fs.readFileSync(path.join(root, "shared/afms-flight-program.js"), "utf8"), context);
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
// Expose the existing browser helpers only inside this isolated test context.
vm.runInContext(source.replace(/\}\)\(\);\s*$/, "globalThis.testApi = { splitFlight, setFlightRow }; })();"), context);
const { splitFlight, setFlightRow } = context.testApi;

// Independently transcribed from the two supplied winter sheets, including EZY5624's correction.
const allocations = [
  ["TOM", ["TOM", "BY"], [
    [229, "2DK"], [262, "78W"], [428, "4AN"], [468, "2HJ"],
    [475, "4LG"], [580, "73H"], [588, "3AC"], [589, "77J"],
    [682, "59V"], [683, "5LW"], [851, "68W"], [858, "25B"], [859, "1XE"]
  ]],
  ["JAF", ["JAF", "TB"], [[2711, "34G"], [2751, "60E"], [2752, "59G"]]],
  ["EZS", ["EZS", "DS"], [[1273, "96NZ"], [1274, ""], [1579, "65LT"], [1580, "67GV"]]],
  ["EZY", ["EZY"], [
    [2275, "97TR"], [2276, "68UE"], [2277, "96VU"], [2278, "58TL"],
    [2651, "469E"], [2652, "93ED"], [2879, "94WN"], [2880, "85ZD"],
    [3071, ""], [3072, "76WN"], [3119, "31YX"], [3120, ""],
    [3329, "15EF"], [3330, "65LA"], [3491, "16NL"], [3492, ""],
    [5623, "47XZ"], [5624, "85YK"], [5729, "41NL"], [5730, ""],
    [6617, "92RK"], [6618, "25FY"], [8853, "86EB"], [8854, "35CR"],
    [8855, "89XC"], [8856, "86KJ"], [8863, "75JA"], [8864, "32YK"],
    [8866, "52QY"], [8881, "86DP"], [8882, "48FE"]
  ]]
];

assert.equal(allocations.reduce((total, [, , rows]) => total + rows.length, 0), 51);
for (const [icao, aliases, rows] of allocations) {
  for (const [number, suffix] of rows) {
    test(`${icao}${number} winter allocation and aliases`, () => {
      const expected = suffix ? `${number}/${suffix}` : String(number);
      for (const carrier of aliases) {
        for (const separator of ["", " "]) {
          for (const date of ["2026-10-25T00:00:00", "2026-10-26", "2027-03-27T23:59:00"]) {
            for (const staleSuffix of ["", "/OLD"]) {
              const actual = splitFlight(`${carrier}${separator}${number}${staleSuffix}`, date);
              assert.equal(actual.carrier, carrier);
              assert.equal(actual.icao, icao);
              assert.equal(actual.number, expected);
            }
          }
        }
      }
    });
  }
}

test("historical reports retain the previous season and corrections", () => {
  for (const [flight, expected] of [
    ["BY 229", "229/3AY"], ["TB 2711", "2711/1DY"],
    ["DS 1277", "1277/26LA"], ["EZY 2275", "2275/73GW"],
    ["EZY 3329", "3329/43KR"], ["EZY 3491/OLD", "3491"],
    ["EZY 2281", "2281/46AH"], ["EZY 5624", "5624/39GY"]
  ]) {
    assert.equal(splitFlight(flight, "2026-10-24T23:59:00").number, expected);
  }
});

test("unlisted winter flights do not inherit previous seasonal suffixes", () => {
  for (const flight of ["BY 474/5PV", "TOM 528", "EZY 2281/46AH", "DS 1277", "JAF 9999"]) {
    assert.equal(splitFlight(flight, "2026-12-01").number, flight.match(/\d+/)[0]);
  }
});

test("expired winter allocations are not applied to later flights", () => {
  assert.equal(splitFlight("BY 229", "2027-03-28").number, "229");
  assert.equal(splitFlight("EZY 2275", "2027-03-28").number, "2275");
  assert.equal(splitFlight("EZY 2275/NEW", "2027-03-28").number, "2275/NEW");
});

test("other airlines and alphanumeric carrier codes are unchanged", () => {
  for (const [flight, icao, expected] of [
    ["H3 112", "HLJ", "112/5GH"], ["4V 123", "SQY", "123"],
    ["B2 812", "BRU", "812"], ["NO1432", "NOS", "1432/68EP"],
    ["TFL 3621", "TFL", "3621/3KA"], ["ENT1344", "ENT", "1344"]
  ]) {
    const actual = splitFlight(flight, "2026-10-26");
    assert.equal(actual.icao, icao);
    assert.equal(actual.number, expected);
  }
});

test("blank flights remain blank; whitespace and case are normalized", () => {
  assert.equal(splitFlight("", "2026-10-26").number, "");
  assert.equal(splitFlight(null, "2026-10-26").carrier, "");
  assert.equal(splitFlight(" ezy 5624 / old ", "26.10.2026 08:00").number, "5624/85YK");
});

function worksheetStub() {
  const cells = new Map();
  return {
    getCell(row, col) {
      const key = `${row},${col}`;
      if (!cells.has(key)) cells.set(key, { value: null });
      return cells.get(key);
    }
  };
}

test("Excel rows use each leg's date across the season boundary", () => {
  const sheet = worksheetStub();
  setFlightRow(sheet, 11, {
    arrivalFlight: "BY262", departureFlight: "BY229",
    sta: "2026-10-24T23:30:00", std: "2026-10-25T01:00:00",
    origin: "NCL", destination: "EMA", aircraft: "B738", gate: "12"
  }, "2026-10-25");
  for (const [column, expected] of [[2, "BY"], [3, "TOM"], [4, "262/8LK"], [6, "23:30"],
    [8, "B738"], [10, "BY"], [11, "TOM"], [12, "229/2DK"], [13, "EMA"], [14, "01:00"]]) {
    assert.equal(sheet.getCell(11, column).value, expected);
  }
});

test("Excel rows use the report date if an arrival time is missing", () => {
  const sheet = worksheetStub();
  setFlightRow(sheet, 11, { arrivalFlight: "EZY 5624/39GY", departureFlight: "TB 2752" }, "2026-10-26");
  assert.equal(sheet.getCell(11, 4).value, "5624/85YK");
  assert.equal(sheet.getCell(11, 12).value, "2752/59G");
});
