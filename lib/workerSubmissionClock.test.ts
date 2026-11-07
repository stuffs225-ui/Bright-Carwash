import {describe,it,expect} from "vitest";
import {submissionInServerRiyadhDay} from "./workerSubmissionClock";
describe("Offline worker record date",()=>{
 const now=new Date("2026-11-07T21:10:00.000Z"); // Nov 8 Riyadh
 it("rejects silently moving old-day record into new settlement",()=>{
  expect(submissionInServerRiyadhDay("2026-11-07T20:59:59.000Z",now)).toBe(false);
 });
 it("accepts same Riyadh day",()=>{
  expect(submissionInServerRiyadhDay("2026-11-07T21:00:00.000Z",now)).toBe(true);
 });
 it("blocks impossible future stamps and invalid text",()=>{
  expect(submissionInServerRiyadhDay("2026-11-08T22:00:00.000Z",now)).toBe(false);
  expect(submissionInServerRiyadhDay("wrong",now)).toBe(false);
 });
 it("supports encrypted queued records from prior v1 without timestamps",()=>{
  expect(submissionInServerRiyadhDay(undefined,now)).toBe(true);
 });
});