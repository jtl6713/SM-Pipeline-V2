import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('./assets/rendering-review-queue.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./assets/rendering-review-queue.css',import.meta.url),'utf8');

test('Rendering Review has a dedicated navigation item and responsive page',()=>{
  assert.match(html,/data-page="rendering-review" id="navRenderingReview" hidden/);
  assert.match(html,/id="page-rendering-review" class="page"/);
  assert.match(html,/<button class="nav-item" data-page="rendering-review" id="navRenderingReview" hidden>Post Production Edits<\/button>/);
  assert.match(html,/<h1>Post Production Edits<\/h1>/);
  assert.match(html,/id="page-rendering-review" class="page" aria-label="Post Production Edits"/);
  assert.doesNotMatch(html,/>Rendering Review<\/(?:button|h1)>/);
  // Reuse existing navigation, session and API identities: this is a label-only release.
  assert.match(js,/\$\('page-rendering-review'\)/);
  assert.match(js,/\$\('navRenderingReview'\)/);
  for(const id of ['rrStatus','rrRefresh','rrCount','rrQueueList','rrDetail','rrVideo','rrOpenFile','rrMore']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(css,/@media\s*\(max-width:760px\)/);
  assert.match(html,/rendering-review-queue\.js\?v=\d+\.\d+\.\d+/);
  assert.match(html,/rendering-review-queue\.css\?v=\d+\.\d+\.\d+/);
});
test('rendering review allows conversation only after Factory submission, never direct enrollment',()=>{
  assert.match(html,/Chicago pilot · protected manual review/);
  assert.doesNotMatch(js,/Review with Producer/);
  assert.doesNotMatch(js,/\/enroll/);
  assert.match(js,/Factory-submitted reviews/);
  assert.match(js,/entry.manual_admission_enabled===true/);
  assert.match(js,/data.flags.admission_enabled!==true/);
  assert.match(js,/automatic_sampling_percent!==0/);
  assert.match(js,/method:'GET'/);
  assert.match(js,/method:'POST'/);
  assert.doesNotMatch(js,/method\s*:\s*['"](?:PATCH|PUT|DELETE)['"]/i);
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
  assert.match(html,/rel="noopener noreferrer"/);
});
test('mobile video playback and read-only state are accessible',()=>{
  assert.match(html,/<video id="rrVideo"[^>]*controls playsinline preload="none" hidden/);
  assert.match(html,/aria-live="polite"/);
  assert.match(js,/clearMedia\(\)/);
  assert.match(js,/video\.pause\(\)/);
  assert.match(css,/\.rr-preview\[hidden\]/);
});

test('Chicago V1 and V2 use authenticated native MP4 streaming rather than Drive iframe',()=>{
  assert.match(js,/url\('\/api\/outputs\//);
  assert.match(js,/url\('\/api\/rendering-review\/outputs\//);
  assert.match(js,/\/attempts\//);
  assert.match(js,/video\.src=value/);
  assert.match(js,/video\.load\(\)/);
  assert.doesNotMatch(js,/function drivePreview/);
  assert.doesNotMatch(js,/insertAdjacentElement\(['"]afterend['"],frame\)/);
});
