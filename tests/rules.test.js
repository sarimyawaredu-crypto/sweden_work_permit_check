import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, medianOn, referenceTable, toMonthly, blueCardThresholdOn, fmt } from "../rules.js";

const base = { applicationDate: "2026-11-23", type: "first", currentPermitGrantedBefore1June: false, exemptOccupation: null, exemptCategory: null, blueCard: null };

test("published figures match Migrationsverket", () => {
  const t = referenceTable("2026-11-23");
  assert.equal(t.median, 38300);
  assert.equal(t.standard, 34470);  // quoted by Migrationsverket
  assert.equal(t.transitional, 30640); // quoted by Migrationsverket
  assert.equal(t.exempt, 28725);
  assert.equal(t.blueCard, 53625);
  assert.equal(Math.ceil(medianOn("2026-05-01") * 0.8), 29680); // quoted April 2026
});

test("median switches on 16 June 2026", () => {
  assert.equal(medianOn("2026-06-15"), 37100);
  assert.equal(medianOn("2026-06-16"), 38300);
  assert.throws(() => medianOn("2024-01-01"), RangeError);
});

test("standard rule: exactly at threshold passes, one krona under fails", () => {
  assert.equal(assess({ ...base, monthlySalary: 34470 }).meets, true);
  assert.equal(assess({ ...base, monthlySalary: 34469 }).meets, false);
});

test("former student gets the 75% rule", () => {
  const r = assess({ ...base, monthlySalary: 30000, exemptCategory: "former_student" });
  assert.equal(r.rule, "exempt_category");
  assert.equal(r.threshold, 28725);
  assert.equal(r.meets, true);
});

test("category exemption not applied before 11 June 2026", () => {
  const r = assess({ ...base, applicationDate: "2026-06-05", monthlySalary: 30000, exemptCategory: "former_student" });
  assert.equal(r.rule, "standard");
});

test("exempt occupation gets the 75% rule", () => {
  const r = assess({ ...base, monthlySalary: 29000, exemptOccupation: "IT support technicians" });
  assert.equal(r.rule, "exempt_occupation");
  assert.equal(r.meets, true);
});

test("transitional extension until 1 December 2026 only", () => {
  const ext = { ...base, type: "extension", currentPermitGrantedBefore1June: true, monthlySalary: 31000 };
  assert.equal(assess({ ...ext, applicationDate: "2026-12-01" }).rule, "transitional");
  assert.equal(assess({ ...ext, applicationDate: "2026-12-01" }).meets, true);
  assert.equal(assess({ ...ext, applicationDate: "2026-12-02" }).rule, "standard");
  assert.equal(assess({ ...ext, applicationDate: "2026-12-02" }).meets, false);
});

test("blue card needs salary, qualification and six months", () => {
  const ok = assess({ ...base, monthlySalary: 55000, blueCard: { degreeOrExperience: true, monthsOfContract: 12 } });
  assert.equal(ok.blueCard.eligible, true);
  const bad = assess({ ...base, monthlySalary: 50000, blueCard: { degreeOrExperience: false, monthsOfContract: 3 } });
  assert.equal(bad.blueCard.eligible, false);
  assert.equal(bad.blueCard.reasons.length, 3);
  assert.equal(blueCardThresholdOn("2026-07-14"), 52000);
});

test("annual salary converts to monthly", () => {
  assert.equal(toMonthly(420000, "year"), 35000);
  assert.throws(() => toMonthly(-1));
});

test("formatting uses Swedish grouping", () => {
  assert.equal(fmt(34470), "34 470 SEK");
});
