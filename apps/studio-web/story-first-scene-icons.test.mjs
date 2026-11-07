import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const js=readFileSync(new URL("./assets/story-first-workspace.js",import.meta.url),"utf8");
const css=readFileSync(new URL("./assets/story-first-workspace.css",import.meta.url),"utf8");

function extract(start,end){
  const i=js.indexOf(start),j=js.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,"source function boundaries must remain discoverable");
  return js.slice(i,j);
}

function mockElement(tag,cls="",value=""){
  const el={
    tagName:tag.toUpperCase(),className:cls,textContent:value,children:[],style:{},
    classList:{add(...names){el.className += " "+names.join(" ");}},
    appendChild(child){child.parentElement=el;el.children.push(child);return child;},
    prepend(child){child.parentElement=el;el.children.unshift(child);return child;},
    querySelector(selector){return el.children.find(n=>n.tagName===selector.toUpperCase())||null;},
    addEventListener(){},
  };
  return el;
}

test("every scene icon stays inside its own labeled field, never prepended above the card header",()=>{
  const labelSource=extract("function label(parent, title, value", "function button(text, className");
  const fieldSource=extract("function sceneField(parent,kind,title,value", "scenes.forEach((shot,index)=>");
  const put=(parent,...children)=>{children.forEach(x=>parent.appendChild(x));return parent;};
  const field=vm.runInNewContext("(()=>{"+labelSource+"\n"+fieldSource+"\nreturn sceneField;})()",{
    node:mockElement, put, sceneIcon:kind=>mockElement("svg","field-icon-"+kind),
  });
  const card=mockElement("article","story-first-shot");
  for(const [kind,title,type] of [
    ["timing","Scene timing","input"],
    ["visual","Required visual","textarea"],
    ["voice","Voiceover / narration","textarea"],
    ["media","Preferred media","select"],
    ["sourcing","Media sourcing","select"],
  ]) {
    const input=field(card,kind,title,"Sample field value",type);
    assert.equal(input.parentElement.tagName,"LABEL",kind+" editor must be in a label");
  }
  assert.equal(card.children.length,5,"scene must have only 5 field labels, no loose SVG icons or controls");
  for(const [index,label] of card.children.entries()){
    assert.equal(label.tagName,"LABEL");
    assert.match(label.className,/story-first-scene-field/);
    assert.equal(label.children.length,3);
    assert.equal(label.children[0].tagName,"SVG","icon is inside the corresponding field");
    assert.equal(label.children[1].tagName,"SPAN","persistent visible field caption follows icon");
    assert.ok(["INPUT","TEXTAREA","SELECT"].includes(label.children[2].tagName));
    assert.equal(label.children[0].parentElement,label);
    assert.equal(label.children[2].parentElement,label);
  }
  assert.equal(card.children.filter(x=>x.tagName==="SVG").length,0,"no top-of-card vertical icon stack");
});

test("desktop tooltip explains icons while mobile retains always-visible labels",()=>{
  const iconSource=extract("function sceneIcon(kind)","function sceneField(parent,kind,title,value");
  assert.match(iconSource,/document\.createElementNS\(ns,"title"\)/);
  assert.match(iconSource,/svg\.appendChild\(title\)/);
  for(const part of ["timing:","visual:","voice:","media:","sourcing:"])
    assert.ok(iconSource.includes(part),"missing tooltip for "+part);
  assert.match(css,/#storyFirstPanel \.story-first-shot > \.story-first-scene-field/);
  assert.match(css,/#storyFirstPanel \.story-first-shot > \.story-first-scene-field > span/);
  assert.match(css,/@media \(max-width: 760px\)/);
});
