// @ts-expect-error Bun provides the test module at runtime.
import { expect, it } from "bun:test";
import { transitCopy } from "./copy-values";

it("keeps favorite flows complete and placeholders consistent in all three languages", () => {
  const keys = Object.keys(transitCopy.en) as (keyof typeof transitCopy.en)[];
  for (const language of ["ru", "ka"] as const) {
    expect(Object.keys(transitCopy[language]).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(transitCopy[language][key].trim().length).toBeGreaterThan(0);
      expect(
        [...transitCopy[language][key].matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1])
          .sort(),
      ).toEqual(
        [...transitCopy.en[key].matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1])
          .sort(),
      );
    }
  }
});
