import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('./assets/rendering-review-queue.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./assets/rendering-review-queue.css',import.meta.url),'utf8');

test('Rendering Review has a dedicated navigation item and responsive page',()=>{
  assert.match(html,/data-page="rendering-review" id="navRenderingReview" hidden/);
  assert.match(html,/id="page-rendering-review" class="page"/);
  for(const id of ['rrStatus','rrRefresh','rrCount','rrQueueList','rrDetail','rrVideo','rrOpenFile','rrMore']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(css,/@media\s*\(max-width:760px\)/);
  assert.match(html,/rendering-review-queue\.js\?v=0\.6\.764/);
  assert.match(html,/rendering-review-queue\.css\?v=0\.6\.764/);
});
test('rendering review is read-only and never displays enrollment, approval or publish actions',()=>{
  assert.match(html,/Chicago pilot · read-only/);
  assert.match(js,/manual_admission_enabled!==false/);
  assert.match(js,/admission_enabled!==false/);
  assert.match(js,/automatic_sampling_percent!==0/);
  assert.match(js,/method:'GET'/);
  assert.doesNotMatch(js,/method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
  assert.doesNotMatch(html,/id="rr(?:Enroll|Approve|Publish|Commit|Send|Replace)"/i);
});
test('authoritative Chicago profile, server permissions and session history are enforced',()=>{
  assert.match(js,/const chicago = 'recT2rbKX3MF7cVFU'/);
  assert.match(js,/session\.permissions\?\.outputs_review===true/);
  assert.match(js,/nav\.hidden=!canReview/);
  assert.match(js,/entry\.profile_id!==chicago/);
  assert.match(js,/entry\.output_type!=='Instagram Reel'/);
  assert.match(js,/\/api\/rendering-review\/queue\?/);
  assert.match(js,/\/api\/rendering-review\/outputs\//);
});
test('untrusted titles and stored conversation text are not inserted as HTML',()=>{
  assert.match(js,/document\.createElement\(tag\)/);
  assert.match(js,/node\.textContent = String\(text\)/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.match(js,/new URL\(String\(value\|\|''\), window\.location\.href\)/);
  assert.match(js,/http:','https:/);
  assert.match(js,/rel="noopener noreferrer"/) || assert.match(html,/rel="noopener noreferrer"/);
});
test('mobile video playback and read-only state are accessible',()=>{
  assert.match(html,/<video id="rrVideo"[^>]*controls playsinline preload="none" hidden/);
  assert.match(html,/aria-live="polite"/);
  assert.match(js,/clearMedia\(\)/);
  assert.match(js,/video\.pause\(\)/);
  assert.match(css,/\.rr-preview\[hidden\]/);
});
