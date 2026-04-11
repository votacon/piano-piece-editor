# Sem auto-preenchimento de pausas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o auto-preenchimento de pausas em compassos, permitindo compassos vazios e overflow visual em vermelho, para que o usuário possa aumentar duração de notas existentes sem ser bloqueado por pausas-fantasma.

**Architecture:** Modificações cirúrgicas em `score-model.js` (núcleo da lógica), `renderer.js` (suporte a compassos vazios e overflow visual), e nos arquivos do editor (`editor-input.js`, `editor-modify.js`, `editor-mouse.js`, `editor-clipboard.js`) para remover lógicas defensivas que dependiam do auto-fill. A ordem das tasks é cuidadosamente escolhida para que o app continue funcionando após cada commit — primeiro o renderer ganha capacidade de tratar compassos vazios e overflow, depois o modelo passa a gerá-los.

**Tech Stack:** JavaScript ES Modules (sem build), VexFlow (CDN), Web Audio API, localStorage. Não há testes automatizados — validação é manual no navegador via `python -m http.server 8000` ou abrindo `index.html`.

**Spec:** [`docs/superpowers/specs/2026-04-11-no-auto-rest-fill-design.md`](../specs/2026-04-11-no-auto-rest-fill-design.md)

---

## Visão geral dos arquivos tocados

| Arquivo | Responsabilidade da mudança |
|---|---|
| `js/score-model.js` | Núcleo: `createEmptyMeasure` vazio, `addNote`/`insertNoteAt`/`replaceNote` sem cap/auto-fill, `removeNote` com nova regra, nova função `isMeasureOverflowing`, remoção de `_cascadeOverflow`. |
| `js/renderer.js` | Suportar compassos vazios (âncora no `noteElementMap`), pintar overflow em vermelho, destacar compasso vazio selecionado em azul. |
| `js/editor-mouse.js` | Terceiro passe no `_hitTest` para selecionar compassos vazios. |
| `js/editor-input.js` | Remover chamadas a `fillMeasureWithRests` e a lógica de "trim adjacent rests". |
| `js/editor-modify.js` | Remover 2 chamadas a `fillMeasureWithRests`. |
| `js/editor-clipboard.js` | Simplificar `pasteAtSelection` — sem rebalance, sem fill, sem expansão de whole-rest. |

**Não tocados:** `js/app.js`, `js/playback.js`, `js/storage.js`, `js/undo-redo.js`, `js/editor-navigation.js`, `js/editor-chord.js`, `js/export.js`, `css/style.css`.

---

## Convenção de teste manual

Como o projeto não tem testes automatizados, cada task termina com instruções de teste manual no navegador. Para rodar:

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor
python -m http.server 8000
# Abrir http://localhost:8000 no navegador
```

Use o **DevTools console** (F12) sempre que o teste pedir inspeção de estado. Antes de cada teste, faça **hard reload** (Cmd+Shift+R) para descartar `localStorage` cacheado. Se o estado persistido atrapalhar, rode `localStorage.clear()` no console e recarregue.

---

## Task 1: Adicionar `isMeasureOverflowing` em score-model.js

**Files:**
- Modify: `js/score-model.js`

Função utilitária pura, sem efeito visível ainda. Vai ser usada pelo renderer na Task 2.

- [ ] **Step 1: Adicionar a função após `measureDuration()`**

Em `js/score-model.js`, logo após a função `measureDuration()` (que termina na linha 58), adicione:

```js
export function isMeasureOverflowing(measure, beats) {
  return measureDuration(measure) > beats + 0.001;
}
```

- [ ] **Step 2: Validação rápida no console**

Recarregue a página. Abra DevTools console e rode:

```js
// Importa via módulo já carregado pelo app
const sm = await import('./js/score-model.js');
sm.isMeasureOverflowing({ notes: [{duration: 'w'}] }, 4)  // false (4 == 4)
sm.isMeasureOverflowing({ notes: [{duration: 'w'}, {duration: 'q'}] }, 4)  // true (5 > 4)
sm.isMeasureOverflowing({ notes: [] }, 4)  // false (0 < 4)
```

Esperado: os três retornos respectivamente `false`, `true`, `false`.

- [ ] **Step 3: Commit**

```bash
git add js/score-model.js
git commit -m "Add isMeasureOverflowing helper to score model"
```

---

## Task 2: Renderer suporta compasso vazio + overflow vermelho + destaque azul

**Files:**
- Modify: `js/renderer.js`

Esta task prepara o renderer pra **todas** as situações novas que o modelo vai gerar nas tasks seguintes. Depois desta task, o app continua funcionando exatamente igual (porque o modelo ainda gera pausas auto-fill), mas o renderer já está pronto.

- [ ] **Step 1: Importar `isMeasureOverflowing`**

No topo de `js/renderer.js`, **substitua** a primeira linha (`const VF = Vex.Flow;`) por:

```js
import { isMeasureOverflowing } from './score-model.js';

const VF = Vex.Flow;
```

- [ ] **Step 2: Helper para detectar seleção em compasso vazio**

Logo abaixo do `LAYOUT` const block (após a linha 18), adicione:

```js
function _isMeasureSelectedAndEmpty(score, staffIndex, measureIndex, selection) {
  const measure = score.staves[staffIndex].measures[measureIndex];
  if (!measure || !measure.notes || measure.notes.length > 0) return false;
  if (!Array.isArray(selection)) {
    return selection && selection.staffIndex === staffIndex && selection.measureIndex === measureIndex;
  }
  return selection.some(s => s.staffIndex === staffIndex && s.measureIndex === measureIndex);
}
```

- [ ] **Step 3: Aplicar estilos de overflow/seleção antes de `stave.draw()`**

Em `renderScore()`, encontre o trecho onde `trebleStave` é criado e desenhado (ao redor da linha 55-66). Substitua esse bloco inteiro:

```js
      const trebleStave = new VF.Stave(xCursor, yOffset, measWidth);
      if (isFirstMeasure) {
        trebleStave.addClef('treble');
        if (isFirstLine) {
          trebleStave.addKeySignature(score.keySignature);
          trebleStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        trebleStave.setEndBarType(VF.Barline.type.END);
      }
      trebleStave.setContext(vfContext).draw();
```

por:

```js
      const trebleStave = new VF.Stave(xCursor, yOffset, measWidth);
      if (isFirstMeasure) {
        trebleStave.addClef('treble');
        if (isFirstLine) {
          trebleStave.addKeySignature(score.keySignature);
          trebleStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        trebleStave.setEndBarType(VF.Barline.type.END);
      }
      const trebleMeasure = score.staves[0].measures[mi];
      if (isMeasureOverflowing(trebleMeasure, score.timeSignature.beats)) {
        trebleStave.setStyle({ strokeStyle: '#dc2626', fillStyle: '#dc2626' });
      } else if (_isMeasureSelectedAndEmpty(score, 0, mi, selection)) {
        trebleStave.setStyle({ strokeStyle: '#93c5fd', fillStyle: '#93c5fd' });
      }
      trebleStave.setContext(vfContext).draw();
```

- [ ] **Step 4: Mesmo tratamento para `bassStave`**

Logo abaixo, encontre o bloco análogo do `bassStave` (linhas ~68-80). Substitua:

```js
      const bassY = yOffset + LAYOUT.staffHeight + LAYOUT.trebleBassGap;
      const bassStave = new VF.Stave(xCursor, bassY, measWidth);
      if (isFirstMeasure) {
        bassStave.addClef('bass');
        if (isFirstLine) {
          bassStave.addKeySignature(score.keySignature);
          bassStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        bassStave.setEndBarType(VF.Barline.type.END);
      }
      bassStave.setContext(vfContext).draw();
```

por:

```js
      const bassY = yOffset + LAYOUT.staffHeight + LAYOUT.trebleBassGap;
      const bassStave = new VF.Stave(xCursor, bassY, measWidth);
      if (isFirstMeasure) {
        bassStave.addClef('bass');
        if (isFirstLine) {
          bassStave.addKeySignature(score.keySignature);
          bassStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        bassStave.setEndBarType(VF.Barline.type.END);
      }
      const bassMeasure = score.staves[1].measures[mi];
      if (isMeasureOverflowing(bassMeasure, score.timeSignature.beats)) {
        bassStave.setStyle({ strokeStyle: '#dc2626', fillStyle: '#dc2626' });
      } else if (_isMeasureSelectedAndEmpty(score, 1, mi, selection)) {
        bassStave.setStyle({ strokeStyle: '#93c5fd', fillStyle: '#93c5fd' });
      }
      bassStave.setContext(vfContext).draw();
```

- [ ] **Step 5: Tratar compasso vazio dentro de `renderMeasureNotes`**

Em `renderMeasureNotes()`, encontre a linha (~106):

```js
  if (!measure || !measure.notes || measure.notes.length === 0) return;
```

Substitua por:

```js
  if (!measure || !measure.notes || measure.notes.length === 0) {
    // Empty-measure anchor for hit-testing and selection
    noteElementMap.push({
      staffIndex,
      measureIndex,
      noteIndex: 0,
      staveNote: null,
      stave,
    });
    return;
  }
```

- [ ] **Step 6: Pintar notas em vermelho quando o compasso está em overflow**

Em `renderMeasureNotes()`, dentro do loop `for (let ni = 0; ni < measure.notes.length; ni++)`, encontre o bloco que aplica estilo de seleção (~linha 159):

```js
    if (isSelected) {
      vfNote.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
    }
```

Substitua por:

```js
    const measureOverflow = isMeasureOverflowing(measure, score.timeSignature.beats);
    if (isSelected) {
      vfNote.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
    } else if (measureOverflow) {
      vfNote.setStyle({ fillStyle: '#dc2626', strokeStyle: '#dc2626' });
    }
```

- [ ] **Step 7: Validação manual no navegador**

Recarregue a página com hard reload. Abra um score qualquer (ou crie um novo). Tudo deve estar **idêntico ao antes** — porque o modelo ainda gera auto-fill e nenhum compasso está em overflow ou vazio. Confira:

1. As notas existentes aparecem normalmente.
2. Cliques selecionam notas (ficam azuis).
3. Edição via teclado funciona.
4. Não há erro vermelho no console.

Se quiser validar o overflow manualmente, no console rode:

```js
// Acessa o estado global do app
const appState = window.__appState || null;  // pode não existir; se não, pular este teste
```

Se não houver hook global, pule o teste de overflow agora — ele será coberto na Task 4 quando o modelo passa a gerar.

- [ ] **Step 8: Commit**

```bash
git add js/renderer.js
git commit -m "Render empty measures with anchor and red overflow"
```

---

## Task 3: editor-mouse — terceiro passe no hit-test

**Files:**
- Modify: `js/editor-mouse.js`

Permite clicar em compassos vazios para selecioná-los. Sem efeito visível enquanto não houver compassos vazios na prática (Task 4).

- [ ] **Step 1: Adicionar terceiro passe no `_hitTest`**

Em `js/editor-mouse.js`, encontre o final da função `_hitTest` (logo antes do `return bestEntry;` na linha ~74):

```js
  return bestEntry;
}
```

Substitua por:

```js
  if (bestEntry) return bestEntry;

  // Third pass: empty-measure anchors (no staveNote, but stave covers the click)
  for (const entry of noteElementMap) {
    if (entry.staveNote !== null) continue;
    if (!entry.stave) continue;
    const staveX = entry.stave.getX();
    const staveW = entry.stave.getWidth();
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();
    if (mx >= staveX && mx <= staveX + staveW &&
        my >= staveY - staveH * 0.5 && my <= staveY + staveH * 1.5) {
      return entry;
    }
  }

  return null;
}
```

- [ ] **Step 2: Validação manual**

Hard reload. Abra um score com notas. Clique numa nota — deve selecionar normalmente (azul). Clique numa região vazia entre staves — seleção deve limpar. Comportamento idêntico ao antes.

- [ ] **Step 3: Commit**

```bash
git add js/editor-mouse.js
git commit -m "Hit-test empty-measure anchors as third pass"
```

---

## Task 4: score-model — `createEmptyMeasure` vazio + `addNote` sem auto-fill

**Files:**
- Modify: `js/score-model.js`

Aqui o comportamento muda visivelmente: novos compassos nascem vazios e adicionar uma nota não preenche o resto.

- [ ] **Step 1: `createEmptyMeasure` retorna `notes: []`**

Em `js/score-model.js`, encontre `createEmptyMeasure()` (linha 46):

```js
function createEmptyMeasure() {
  return {
    notes: [createRest('w')]
  };
}
```

Substitua por:

```js
function createEmptyMeasure() {
  return {
    notes: []
  };
}
```

- [ ] **Step 2: Simplificar `addNote`**

Encontre a função `addNote()` (linha 97). Substitua a função inteira por:

```js
export function addNote(score, staffIndex, measureIndex, noteIndex, note) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;

  const measure = staff.measures[measureIndex];
  const idx = noteIndex === -1 ? measure.notes.length : noteIndex;

  measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
  return true;
}
```

(Removidos: branch do whole-rest inicial, verificação `currentDuration + noteDuration > beats`, lógica de remover pausas pra fazer espaço, chamada final a `fillMeasureWithRests`.)

- [ ] **Step 3: Validação manual — score novo nasce vazio**

Hard reload. Console: `localStorage.clear()` e recarregue. Crie um score novo (ou aceite o default). Esperado:

1. Os 4 compassos da clave de sol e da clave de fá aparecem **vazios** (sem nenhuma pausa visível).
2. Clique no primeiro compasso da clave de sol — o stave fica **azul claro** (destaque de seleção em compasso vazio, vindo da Task 2).
3. Digite a tecla `c` — uma seminima C aparece no compasso clicado, sozinha (sem pausas ao redor).
4. Digite mais `d`, `e`, `f` — seminimas adicionais aparecem em sequência, sem auto-fill.
5. Digite mais uma vez (`g`) — o compasso passa de 4 beats. Esperado: o compasso fica **vermelho** (overflow visual). A nota nova continua lá.

Se algum desses passos quebrar (erro no console, nota não aparece, layout estranho), volte à Task 2 e cheque o renderer.

- [ ] **Step 4: Commit**

```bash
git add js/score-model.js
git commit -m "Create empty measures and stop auto-filling on addNote"
```

---

## Task 5: score-model — `replaceNote` sem cap + `insertNoteAt` simplificado + remover `_cascadeOverflow`

**Files:**
- Modify: `js/score-model.js`

Esta task resolve o **bug original** — agora dá pra aumentar a duração de uma nota sem ser bloqueado.

- [ ] **Step 1: `replaceNote` sem verificação de limite**

Encontre `replaceNote()` (busque por `export function replaceNote`). Substitua a função inteira por:

```js
export function replaceNote(score, staffIndex, measureIndex, noteIndex, newNote) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  measure.notes[noteIndex] = { ...newNote, keys: [...newNote.keys] };
  return true;
}
```

(Removida: a verificação `if (currentTotal - oldDuration + newDuration > beats + 0.001) return false;`)

- [ ] **Step 2: `insertNoteAt` sem auto-fill nem cascade**

Encontre `insertNoteAt()`. Substitua a função inteira por:

```js
export function insertNoteAt(score, staffIndex, measureIndex, noteIndex, note) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;

  const measure = staff.measures[measureIndex];
  const idx = Math.min(noteIndex, measure.notes.length);
  measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
  return true;
}
```

(Removidos: branch do whole-rest inicial, lógica de overflow → pop notes, `fillMeasureWithRests`, chamada a `_cascadeOverflow`.)

- [ ] **Step 3: Remover `_cascadeOverflow` (não é mais usada)**

Encontre a função `_cascadeOverflow()`. Apague-a inteira (do `function _cascadeOverflow(...)` até a `}` final que fecha a função, antes de `export function fillMeasureWithRests(...)`).

- [ ] **Step 4: Validação manual — bug original resolvido**

Hard reload. `localStorage.clear()` e recarregue. Agora reproduza o cenário do bug:

1. Crie score novo. Clique no primeiro compasso da clave de sol.
2. Digite `c` (seminima C aparece).
3. Selecione a nota (já deve estar selecionada).
4. Aperte `1` (whole = semibreve, conferir o atalho do toolbar — a tecla pode ser diferente; veja a UI).
5. **Esperado:** a seminima vira semibreve. Antes da mudança, isso falhava silenciosamente.

Verifique também o insert mode (Alt+letra ou tecla I de toggle):

6. Selecione uma nota qualquer.
7. Use insert-before para inserir uma nota antes dela. Esperado: a nota nova entra antes, sem cascade pra outros compassos. Se ultrapassar o limite, o compasso fica vermelho.

- [ ] **Step 5: Commit**

```bash
git add js/score-model.js
git commit -m "Drop cap and cascade from replaceNote/insertNoteAt"
```

---

## Task 6: score-model — `removeNote` com nova regra

**Files:**
- Modify: `js/score-model.js`

- [ ] **Step 1: Reescrever `removeNote`**

Encontre `removeNote()`. Substitua a função inteira por:

```js
export function removeNote(score, staffIndex, measureIndex, noteIndex) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  // Rule 1: only note in measure → measure becomes empty
  if (measure.notes.length === 1) {
    measure.notes = [];
    return true;
  }

  const removed = measure.notes[noteIndex];

  // Rule 2: removing an explicit rest → splice it away
  if (removed.type === 'rest') {
    measure.notes.splice(noteIndex, 1);
    return true;
  }

  // Rule 3: removing a real note with siblings → replace with rest of same duration
  const rest = createRest(removed.duration);
  if (removed.dotted) rest.dotted = true;
  measure.notes[noteIndex] = rest;
  return true;
}
```

(Mudanças: branch da regra 1 movido pra cima, branch da regra 2 novo, regra 3 mantida. Removida a chamada a `_mergeAdjacentRests`.)

- [ ] **Step 2: Validação manual — todas as regras de delete**

Hard reload. `localStorage.clear()` e recarregue. Crie score novo.

**Regra 1 — única nota some:**
1. Clique no compasso 1 da clave de sol. Digite `c`. Aparece a seminima.
2. Selecione a seminima. Aperte Delete.
3. **Esperado:** o compasso fica completamente vazio (sem pausa visível). Stave fica azul claro (selecionado e vazio).

**Regra 2 — pausa explícita some:**
4. No compasso vazio selecionado, digite `c d e`. Compasso tem `[Cq, Dq, Eq]` (3 beats).
5. Selecione `Dq` e aperte `R`. Esperado: vira pausa de seminima (`[Cq, restQ, Eq]`).
6. Selecione a pausa e aperte Delete.
7. **Esperado:** a pausa some, compasso vira `[Cq, Eq]` (2 beats, sem vermelho — está abaixo do limite).

**Regra 3 — nota com outras vira pausa:**
8. Selecione `Cq` e aperte Delete.
9. **Esperado:** vira pausa de seminima (`[restQ, Eq]`).

- [ ] **Step 3: Commit**

```bash
git add js/score-model.js
git commit -m "Rewrite removeNote: empty/splice/rest based on context"
```

---

## Task 7: editor-input — limpar lógica de pausas adjacentes e fillMeasureWithRests

**Files:**
- Modify: `js/editor-input.js`

- [ ] **Step 1: Simplificar o branch de "selected note is rest" em `insertNoteByKey`**

Em `js/editor-input.js`, encontre o bloco `if (selNote && selNote.type === 'rest')` dentro de `insertNoteByKey()` (linha 49 antes das mudanças). Substitua o bloco inteiro:

```js
    if (selNote && selNote.type === 'rest') {
      const key  = buildKey(name, editorState.currentAccidental, editorState.currentOctave);
      const note = _buildNoteFromState(key);

      _pushUndoIfAvailable();

      // Try direct replace first
      if (replaceNote(score, staffIndex, sel.measureIndex, sel.noteIndex, note)) {
        fillMeasureWithRests(selMeasure, score.timeSignature.beats);
        setSelection([{ staffIndex, measureIndex: sel.measureIndex, noteIndex: sel.noteIndex }]);
        _recordAction('insertNote', { noteName: name });
        _notifyChange();
        return;
      }

      // If note is bigger than the rest (e.g. dotted), trim adjacent rests to fit
      let newNoteDur = DURATION_VALUES[note.duration] || 0;
      if (note.dotted) newNoteDur *= 1.5;
      let oldRestDur = DURATION_VALUES[selNote.duration] || 0;
      if (selNote.dotted) oldRestDur *= 1.5;
      let deficit = newNoteDur - oldRestDur;

      // Remove adjacent rests after the selected one to free up beats
      let idx = sel.noteIndex + 1;
      while (deficit > 0.001 && idx < selMeasure.notes.length) {
        if (selMeasure.notes[idx].type === 'rest') {
          let rd = DURATION_VALUES[selMeasure.notes[idx].duration] || 0;
          if (selMeasure.notes[idx].dotted) rd *= 1.5;
          deficit -= rd;
          selMeasure.notes.splice(idx, 1);
        } else {
          break;
        }
      }

      if (deficit <= 0.001) {
        selMeasure.notes[sel.noteIndex] = { ...note, keys: [...note.keys] };
        fillMeasureWithRests(selMeasure, score.timeSignature.beats);
        setSelection([{ staffIndex, measureIndex: sel.measureIndex, noteIndex: sel.noteIndex }]);
        _recordAction('insertNote', { noteName: name });
        _notifyChange();
      }
      return;
    }
```

por:

```js
    if (selNote && selNote.type === 'rest') {
      const key  = buildKey(name, editorState.currentAccidental, editorState.currentOctave);
      const note = _buildNoteFromState(key);

      _pushUndoIfAvailable();

      if (replaceNote(score, staffIndex, sel.measureIndex, sel.noteIndex, note)) {
        setSelection([{ staffIndex, measureIndex: sel.measureIndex, noteIndex: sel.noteIndex }]);
        _recordAction('insertNote', { noteName: name });
        _notifyChange();
      }
      return;
    }
```

- [ ] **Step 2: Remover `fillMeasureWithRests` em `insertRest`**

Encontre `insertRest()`. No branch `if (note.type === 'rest')`, encontre:

```js
    const newRest = createRest(editorState.currentDuration);
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newRest)) {
      fillMeasureWithRests(measure, score.timeSignature.beats);
      _notifyChange();
    }
```

Substitua por:

```js
    const newRest = createRest(editorState.currentDuration);
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newRest)) {
      _notifyChange();
    }
```

- [ ] **Step 3: Limpar imports não utilizados**

No topo de `js/editor-input.js`, encontre o import:

```js
import {
  createRest, addNote, removeNote, replaceNote,
  addKeyToNote, insertNoteAt,
  DURATION_VALUES, NOTE_NAMES, buildKey,
  fillMeasureWithRests
} from './score-model.js';
```

Após a Task 7 step 1, `DURATION_VALUES` e `fillMeasureWithRests` deixam de ser usados em `editor-input.js` (eram usados só na lógica de "trim adjacent rests" que foi removida). Substitua o import por:

```js
import {
  createRest, addNote, removeNote, replaceNote,
  addKeyToNote, insertNoteAt,
  NOTE_NAMES, buildKey
} from './score-model.js';
```

Para confirmar antes de commitar, busque no arquivo: `DURATION_VALUES` e `fillMeasureWithRests` não devem aparecer mais em nenhum lugar.

- [ ] **Step 4: Validação manual**

Hard reload. `localStorage.clear()` e recarregue. Crie score novo.

1. Crie um compasso `[Cq, Dq, Eq, Fq]` digitando `c d e f`.
2. Selecione `Dq`. Aperte `R` para virar pausa. Compasso fica `[Cq, restQ, Eq, Fq]`.
3. Com a pausa selecionada, digite `g`. **Esperado:** a pausa vira `Gq`. Compasso vira `[Cq, Gq, Eq, Fq]`. Sem fillMeasureWithRests sendo chamado.

- [ ] **Step 5: Commit**

```bash
git add js/editor-input.js
git commit -m "Simplify insertNoteByKey: drop adjacent-rest trimming"
```

---

## Task 8: editor-modify — remover chamadas a `fillMeasureWithRests`

**Files:**
- Modify: `js/editor-modify.js`

- [ ] **Step 1: Remover em `changeDurationOfSelected`**

Em `js/editor-modify.js`, encontre `changeDurationOfSelected()`. Encontre o bloco:

```js
    const newNote = { ...note, keys: [...note.keys], duration: newDuration };
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      fillMeasureWithRests(measure, score.timeSignature.beats);
      anyChanged = true;
    }
```

Substitua por:

```js
    const newNote = { ...note, keys: [...note.keys], duration: newDuration };
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      anyChanged = true;
    }
```

- [ ] **Step 2: Remover em `toggleDot`**

Encontre `toggleDot()`. Encontre o bloco:

```js
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      fillMeasureWithRests(measure, score.timeSignature.beats);
      anyChanged = true;
    }
```

Substitua por:

```js
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      anyChanged = true;
    }
```

- [ ] **Step 3: Limpar import não utilizado**

No topo, encontre:

```js
import {
  replaceNote, parseKey, buildKey,
  keyToMidi, midiToKey, fillMeasureWithRests
} from './score-model.js';
```

Após os steps 1 e 2, `fillMeasureWithRests` não é mais referenciado neste arquivo. Substitua por:

```js
import {
  replaceNote, parseKey, buildKey,
  keyToMidi, midiToKey
} from './score-model.js';
```

Confirme buscando `fillMeasureWithRests` no arquivo — não deve haver nenhuma ocorrência.

- [ ] **Step 4: Validação manual — bug original 100% resolvido**

Hard reload. `localStorage.clear()` e recarregue. Crie score novo.

1. Compasso `[Cq]`. Selecione, mude a duração para semibreve via toolbar (atalho de duração).
2. **Esperado:** vira `[Cw]`. Compasso tem 4 beats. Sem vermelho.
3. Compasso `[Cq, Dq, Eq, Fq]`. Selecione `Cq`, mude para semibreve.
4. **Esperado:** vira `[Cw, Dq, Eq, Fq]`, total = 7 beats. **Compasso fica vermelho.**

- [ ] **Step 5: Commit**

```bash
git add js/editor-modify.js
git commit -m "Drop fillMeasureWithRests from changeDuration and toggleDot"
```

---

## Task 9: editor-clipboard — simplificar `pasteAtSelection`

**Files:**
- Modify: `js/editor-clipboard.js`

`pasteAtSelection` tem ~80 linhas de lógica defensiva que não faz mais sentido. Vai virar uma função muito menor.

- [ ] **Step 1: Reescrever `pasteAtSelection`**

Em `js/editor-clipboard.js`, encontre a função `pasteAtSelection()`. Substitua a função inteira por:

```js
export function pasteAtSelection() {
  if (!clipboard || clipboard.notes.length === 0) return;
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const sel = _primarySel();
  if (!sel) return;

  _pushUndoIfAvailable();

  const score = getScore();
  const beats = score.timeSignature.beats;
  const staffIdx = sel.staffIndex;
  const staff = score.staves[staffIdx];

  const clipNotes = clipboard.notes.map(n => JSON.parse(JSON.stringify(n)));

  let mi = sel.measureIndex;
  let ni = sel.noteIndex;
  const pastedPositions = [];

  for (const clipNote of clipNotes) {
    if (mi >= staff.measures.length) break;

    const measure = staff.measures[mi];
    measure.notes.splice(ni, 0, clipNote);
    pastedPositions.push({ staffIndex: staffIdx, measureIndex: mi, noteIndex: ni });
    ni++;

    // If this measure now overflows, advance to next measure for the next note
    if (measureDuration(measure) > beats + 0.001) {
      mi++;
      ni = 0;
    }
  }

  setSelection(pastedPositions);
  _notifyChange();
}
```

(Removidos: expansão de whole-rest, "remove notes/rests to make room", `fillMeasureWithRests` defensivo, "rebalance affected measures", "collapse to whole rest if all rests".)

- [ ] **Step 2: Limpar imports não utilizados**

No topo do arquivo, encontre:

```js
import {
  createRest,
  DURATION_VALUES, measureDuration, fillMeasureWithRests
} from './score-model.js';
```

Após reescrever `pasteAtSelection`, `createRest`, `DURATION_VALUES` e `fillMeasureWithRests` deixam de ser referenciados. `measureDuration` continua usado dentro do novo `pasteAtSelection`. Substitua por:

```js
import { measureDuration } from './score-model.js';
```

Confirme buscando os 3 nomes removidos no arquivo — nenhuma ocorrência deve restar.

- [ ] **Step 3: Validação manual — copy/paste/cut/duplicate**

Hard reload. `localStorage.clear()` e recarregue. Crie score novo.

1. Digite `c d e f` no compasso 1. Compasso fica `[Cq, Dq, Eq, Fq]`.
2. Selecione `Cq`. Cmd+C (copy).
3. Clique no compasso 2 (deve estar vazio, fica azul). Cmd+V (paste).
4. **Esperado:** o compasso 2 vira `[Cq]` (só uma nota, sem auto-fill).
5. Selecione as 4 notas do compasso 1 (clique na primeira, shift+clique na última, ou use Ctrl+A se existir). Cmd+C.
6. Vá para o compasso 3 vazio. Cmd+V.
7. **Esperado:** o compasso 3 vira `[Cq, Dq, Eq, Fq]` (4 beats, exato).
8. Repita: cole de novo no compasso 3 (que agora tem 4 notas).
9. **Esperado:** as 4 notas novas entram, total 8 beats no compasso 3 → fica vermelho.
10. Teste cut: selecione `Cq` no compasso 3, Cmd+X. **Esperado:** vira pausa (delete já testado na Task 6).
11. Teste duplicate (Cmd+D ou atalho equivalente): seleciona a próxima posição e cola.

- [ ] **Step 4: Commit**

```bash
git add js/editor-clipboard.js
git commit -m "Simplify pasteAtSelection — no rebalance, no fill"
```

---

## Task 10: Validação manual completa (plano de teste do spec)

**Files:** nenhum (só validação)

Esta task roda o plano de teste do spec inteiro pra garantir que tudo funciona em conjunto. Sem commit no final — só uma checklist.

- [ ] **Step 1: Limpar tudo e abrir limpo**

```bash
# No navegador console:
localStorage.clear()
location.reload()
```

- [ ] **Step 2: Criar score novo → compassos vazios → clique seleciona**

Aceite o default ou crie um novo. Esperado: 4 compassos × 2 staves todos visualmente vazios. Clique no compasso 1 do treble — stave fica azul claro. Clique numa região fora — limpa seleção.

- [ ] **Step 3: Bug original — seminima vira semibreve**

1. Compasso 1 selecionado. Digite `c`. Aparece `Cq`.
2. Selecione `Cq`. Mude duração para `w` (semibreve).
3. **Esperado:** vira `Cw`. Compasso completo, sem vermelho.

- [ ] **Step 4: Overflow vermelho ida-e-volta**

1. Limpe e crie compasso `[Cq, Dq, Eq, Fq]`.
2. Mude `Cq` para `Cw`. **Esperado:** compasso fica vermelho (7 beats).
3. Mude `Cw` de volta para `Cq`. **Esperado:** vermelho some.

- [ ] **Step 5: Delete — todas as 3 regras**

1. Compasso `[Cq]`. Delete. **Esperado:** compasso vazio.
2. Compasso `[Cq, Dq, Eq]`. Delete em `Dq`. **Esperado:** vira `[Cq, restQ, Eq]`.
3. Mesma situação. Delete na pausa. **Esperado:** vira `[Cq, Eq]`. Sem vermelho.

- [ ] **Step 6: Pausa explícita via R, depois delete**

1. Compasso `[Cq, Dq]`. Selecione `Dq`, aperte `R`. Vira `[Cq, restQ]`.
2. Delete na pausa. **Esperado:** some, vira `[Cq]`.

- [ ] **Step 7: Playback com overflow**

1. Crie compasso em overflow (ex: 7 beats em 4/4).
2. Aperte Espaço (play).
3. **Esperado:** playback toca todas as notas em sequência sem crash. Cursor pode ficar visualmente estranho na borda do compasso, mas o áudio funciona até o fim.
4. Stop.

- [ ] **Step 8: Exportar com vermelho**

1. Mantenha um compasso em vermelho.
2. Exporte PDF (e PNG).
3. **Esperado:** o vermelho aparece no PDF/PNG exportado.

- [ ] **Step 9: Carregar score antigo**

1. Se ainda houver um score salvo no `localStorage` de antes da mudança, carregue-o (ou pule este passo). Esperado: renderiza igual antes (cheio de pausas). Não há crash. Sem migração — é esperado.

- [ ] **Step 10: Undo/Redo**

1. Crie nota. Delete. Undo (Cmd+Z). **Esperado:** nota volta. Redo (Cmd+Shift+Z). **Esperado:** some de novo.

- [ ] **Step 11: Treble e bass com tamanhos diferentes**

1. No treble, crie compasso com 5 beats (overflow).
2. No bass do mesmo índice, crie um compasso com 3 beats (underfull).
3. **Esperado:** treble fica vermelho, bass não. Ambos renderizam. Play funciona — toca cada staff pela sua duração própria.

- [ ] **Step 12: Compasso vazio é navegável por teclado**

1. Compasso vazio. Selecione via clique. Use as setas pra navegar.
2. **Esperado:** ou as setas pulam pra próxima nota não-vazia, ou a seleção fica no compasso vazio. Qualquer um dos dois é OK — só não pode crashar.

- [ ] **Step 13: Sem regressões no chord mode**

1. Selecione uma nota. Aperte uma tecla pra entrar em chord mode (verificar atalho).
2. Adicione uma cifra acima da nota. **Esperado:** funciona.

- [ ] **Step 14: Final — não commitar**

Esta task é só validação. Não há commit. Se algum passo falhar, volte na task correspondente e diagnostique. Se tudo passou, o plano está completo.

---

## Critérios de aceitação

- [ ] Compassos novos nascem vazios (sem pausas).
- [ ] Adicionar nota não preenche o resto com pausas.
- [ ] Aumentar duração de uma nota existente funciona, mesmo que ultrapasse o limite (overflow vermelho).
- [ ] Delete na única nota → compasso vazio.
- [ ] Delete numa nota com outras → vira pausa.
- [ ] Delete em pausa explícita → some.
- [ ] Compasso em overflow é renderizado em vermelho (stave + notas).
- [ ] Compasso vazio selecionado é destacado em azul claro.
- [ ] Cliques em compasso vazio funcionam (terceiro passe do hit-test).
- [ ] Playback funciona em compassos com qualquer tamanho.
- [ ] PDF/PNG exportados mantêm o vermelho.
- [ ] Scores antigos do `localStorage` continuam renderizando (sem migração).
- [ ] Copy/paste/cut/duplicate funcionam sem rebalance defensivo.
- [ ] Sem regressões em playback, undo/redo, chord mode, navegação.
