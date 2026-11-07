import {describe,it,expect} from "vitest";
import {canonicalExpenseType,EXPENSE_QUICK_CHOICES} from "./expenseCategories";
describe("historical expense categorization without mutation",()=>{
 it("groups spelling duplicates",()=>{
  expect(canonicalExpenseType("مواد استهلاكيه")).toBe("مواد استهلاكية");
  expect(canonicalExpenseType("مواد استهلاكية")).toBe("مواد استهلاكية");
  expect(canonicalExpenseType("إيجار")).toBe("إيجار");
  expect(canonicalExpenseType("ايجار")).toBe("إيجار");
 });
 it("does not misclassify people as paid salaries",()=>{
  expect(canonicalExpenseType("حسين")).toBe("باسم شخص — يحتاج تصنيف");
  expect(canonicalExpenseType("محمد عمر")).toBe("باسم شخص — يحتاج تصنيف");
 });
 it("keeps common quick expense choices without hardcoded money",()=>{
  expect(EXPENSE_QUICK_CHOICES.some(x=>x.name==="وايت ماء")).toBe(true);
  expect(EXPENSE_QUICK_CHOICES.every(x=>!("amount" in x))).toBe(true);
 });
});
