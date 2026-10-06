import test from "node:test";
import assert from "node:assert/strict";
import {
  libraryAssetNameFindFormula,
  libraryNameHasPhrase,
  libraryNameSort,
  libraryQuotedPhrase,
} from "./library-phrase.mjs";

test("quotes keep the whole name and ignore the quote marks", () => {
  assert.equal(libraryQuotedPhrase('"Staten Island Ferry"'), "Staten Island Ferry");
  assert.equal(libraryQuotedPhrase("“Staten Island Ferry”"), "Staten Island Ferry");
  assert.equal(libraryQuotedPhrase("'Staten Island Ferry'"), "Staten Island Ferry");
  assert.equal(libraryQuotedPhrase("Staten Island Ferry"), "");
});

test("a quoted name matches the numbered set and not a shared word", () => {
  const phrase = "Staten Island Ferry";
  assert.equal(libraryNameHasPhrase("Staten Island Ferry 1", phrase), true);
  assert.equal(libraryNameHasPhrase("staten island ferry 12", phrase), true);
  assert.equal(libraryNameHasPhrase("Governors Island", phrase), false);
  assert.equal(libraryNameHasPhrase("Island Ferry", phrase), false);
});

test("numbered names sort 1, 2, 10", () => {
  const names = ["Staten Island Ferry 10", "Staten Island Ferry 2", "Staten Island Ferry 1"];
  assert.deepEqual([...names].sort(libraryNameSort), [
    "Staten Island Ferry 1",
    "Staten Island Ferry 2",
    "Staten Island Ferry 10",
  ]);
});

test("quoted search looks up the phrase in the asset name", () => {
  assert.equal(
    libraryAssetNameFindFormula("Staten Island Ferry"),
    'FIND("staten island ferry", LOWER({Asset Name}))',
  );
});
