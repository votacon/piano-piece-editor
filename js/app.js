// app.js — Bootstrap and orchestration
// Verify VexFlow loaded from CDN
const VF = Vex.Flow;
console.log('VexFlow loaded:', typeof VF !== 'undefined');
console.log('VexFlow classes available:', Object.keys(VF).slice(0, 10).join(', '), '...');

// Quick rendering test
const div = document.getElementById('score-container');
const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
renderer.resize(800, 200);
const context = renderer.getContext();

const trebleStave = new VF.Stave(10, 20, 780);
trebleStave.addClef('treble').addTimeSignature('4/4').addKeySignature('C');
trebleStave.setContext(context).draw();

const bassStave = new VF.Stave(10, 120, 780);
bassStave.addClef('bass').addTimeSignature('4/4').addKeySignature('C');
bassStave.setContext(context).draw();

const connector = new VF.StaveConnector(trebleStave, bassStave);
connector.setType(VF.StaveConnector.type.BRACE);
connector.setContext(context).draw();

const lineConnector = new VF.StaveConnector(trebleStave, bassStave);
lineConnector.setType(VF.StaveConnector.type.SINGLE_LEFT);
lineConnector.setContext(context).draw();

console.log('Scaffolding test: grand staff rendered successfully');
