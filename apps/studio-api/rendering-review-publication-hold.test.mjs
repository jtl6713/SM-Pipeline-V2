import test from "node:test";
import assert from "node:assert/strict";
import {renderingReviewHoldPresent} from "./rendering-review-publication-hold.mjs";

const has = fields => renderingReviewHoldPresent(name => fields[name]);

test("unselected output is unaffected with absent or empty hold fields", () => {
  assert.equal(has({}),false);
  assert.equal(has({Studio_Render_Review_Hold_Active:false,
    Studio_Render_Review_Hold_ID:"",Studio_Review_Hold_ID:""}),false);
  assert.equal(has({Studio_Render_Review_Hold_Active:"false"}),false);
});
test("production review checkbox blocks independently of Do_Not_Publish", () => {
  assert.equal(has({Do_Not_Publish:false,Studio_Render_Review_Hold_Active:true}),true);
  assert.equal(has({Do_Not_Publish:false,Studio_Render_Review_Hold_Active:"true"}),true);
});
test("either retained hold ID blocks even if checkbox was cleared", () => {
  assert.equal(has({Studio_Render_Review_Hold_Active:false,Studio_Render_Review_Hold_ID:"hold-00000001"}),true);
  assert.equal(has({Studio_Review_Hold_ID:"staging-hold-00000001"}),true);
});
test("unrelated Do_Not_Publish is preserved as a separate approval restriction", () => {
  assert.equal(has({Do_Not_Publish:true}),false);
});
test("invalid read adapter is rejected instead of pretending no hold", () => {
  assert.throws(()=>renderingReviewHoldPresent(null),TypeError);
});
