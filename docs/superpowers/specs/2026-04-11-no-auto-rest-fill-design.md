# Design — Sem auto-preenchimento de pausas

**Data:** 2026-04-11
**Status:** Aprovado, pronto para implementação

## Problema

Hoje, quando o usuário insere uma nota em um compasso, o editor preenche automaticamente o resto do compasso com pausas via `fillMeasureWithRests()`. Isso bloqueia edições posteriores: tentar aumentar a duração de uma nota existente (ex.: seminima → semibreve) falha porque `replaceNote()` rejeita qualquer nova duração que ultrapasse o total atual do compasso, e o "espaço" já está ocupado por pausas auto-geradas.

O usuário quer **compassos vazios por padrão** — apenas o que ele escreveu, sem pausas fantasmas no caminho.

## Decisões

1. **Compassos podem estar vazios** (`measure.notes === []`).
2. **Compassos podem estar em overflow** (soma das durações das notas > `timeSignature.beats`). Quando isso acontece, o compasso é renderizado em **vermelho** como sinal visual. O playback continua funcionando — toca cada nota pela sua duração própria, ignorando barras.
3. **O vermelho aparece também em exportações PDF/PNG**. O usuário decide quando arrumar.
4. **Delete numa nota** com outras notas no compasso → vira pausa de mesma duração. **Delete na única nota** → compasso fica vazio. **Delete em pausa explícita** → some completamente (não vira outra pausa).
5. **Tecla R** mantida — insere pausa explícita. Pausas explícitas só nascem assim ou via Delete em nota com outras notas.
6. **Sem migração** de scores antigos do `localStorage`. Eles continuam renderizando como antes (cheios de pausas), porque o renderer aceita pausas — só não cria mais.

## Mudanças por arquivo

### `js/score-model.js`

| Função | Mudança |
|---|---|
| `createEmptyMeasure()` | Retorna `{ notes: [] }` em vez de `[createRest('w')]`. |
| `addNote()` | Remove o branch que substitui o whole-rest inicial. Remove a verificação `currentDuration + noteDuration > beats`. Remove `fillMeasureWithRests()` no final. Apenas `splice` da nota na posição. |
| `insertNoteAt()` | Remove o branch do whole-rest inicial. Remove `fillMeasureWithRests()`. **Remove o cascade overflow inteiro** (`_cascadeOverflow`) — notas não transbordam mais; ficam no compasso e ele vira vermelho. |
| `replaceNote()` | Remove a verificação de limite (`currentTotal - oldDuration + newDuration > beats`). Aceita qualquer nova duração. |
| `removeNote()` | Nova lógica, **nesta ordem**: (1) se `measure.notes.length === 1` → `measure.notes = []` (qualquer que seja o tipo). (2) Senão, se a nota removida é uma pausa (`type === 'rest'`) → `splice` (remove de vez). (3) Caso geral (nota real com outras notas no compasso) → vira pausa de mesma duração, preservando `dotted`. Não chama mais `_mergeAdjacentRests`. |
| `_mergeAdjacentRests()` | Mantida no arquivo (não usada por enquanto, mas inofensiva). |
| `fillMeasureWithRests()` | Mantida (pode ser útil futuramente, e mantém compatibilidade). Não chamada mais pelo fluxo de edição. |
| `_cascadeOverflow()` | **Removida** (não é mais usada). |

**Nova função utilitária exportada:**

```js
export function isMeasureOverflowing(measure, beats) {
  return measureDuration(measure) > beats + 0.001;
}
```

### `js/renderer.js`

- Importar `isMeasureOverflowing` de `score-model.js`.
- Em `renderScore()`, antes de cada `stave.draw()`, calcular `trebleOverflow` e `bassOverflow` do compasso e chamar `stave.setStyle({ strokeStyle: '#dc2626', fillStyle: '#dc2626' })` se overflow.
- Em `renderMeasureNotes()`, dentro do loop de notas, se o compasso está em overflow e a nota não está selecionada, chamar `vfNote.setStyle({ fillStyle: '#dc2626', strokeStyle: '#dc2626' })`.
- Em `renderMeasureNotes()`, se `measure.notes.length === 0`, em vez de retornar cedo silenciosamente, **adicionar uma âncora ao `noteElementMap`**:

```js
if (!measure || !measure.notes || measure.notes.length === 0) {
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

- Detecção de seleção em compasso vazio: se a seleção atual aponta para um compasso vazio (`measure.notes.length === 0` e `selection` contém esse compasso com `noteIndex === 0`), pintar o stave em azul claro: `stave.setStyle({ strokeStyle: '#93c5fd' })`. Isso é feito no mesmo bloco onde o overflow é checado, antes de `draw()`. **Compasso vazio nunca pode estar em overflow** (0 < beats), então não há conflito de estilos. Notas reais selecionadas continuam sendo pintadas em azul individualmente no loop de notas (linha 159-161 do renderer atual) — o destaque azul do stave é exclusivo para o caso "compasso vazio selecionado".

### `js/editor-input.js`

- `insertNoteByKey()` linha 57: remover `fillMeasureWithRests()` após o `replaceNote`.
- `insertNoteByKey()` linhas 64-91 (todo o branch "if note is bigger than the rest, trim adjacent rests"): **remover inteiro**. Como `replaceNote()` agora aceita qualquer duração, basta o `replaceNote` simples no caminho de cima. Se sobrar espaço ou faltar, é problema do compasso.
- `insertRest()` linha 152: remover `fillMeasureWithRests()` após o `replaceNote`.
- `deleteSelectedNote()`: sem mudança (delega para `removeNote()`, que já implementa a regra nova).

### `js/editor-modify.js`

- `changeDurationOfSelected()` linha 108: remover `fillMeasureWithRests()`.
- `toggleDot()` linha 255: remover `fillMeasureWithRests()`.

### `js/editor-clipboard.js`

`pasteAtSelection()` tem várias chamadas a `fillMeasureWithRests()` e lógica que assume compassos sempre cheios. Simplificar:

- **Remover** o branch "expand whole rest into individual rests" (linhas 88-95): compassos novos não terão mais whole-rest auto-fill.
- **Remover** o `fillMeasureWithRests` defensivo dentro do loop de inserção (linhas 126-133): depois de inserir uma nota do clipboard, se o compasso passou do limite, move pro próximo compasso (cria um se preciso). Sem cap, sem fill. Se ficou abaixo, simplesmente continua inserindo no mesmo compasso até esgotar o clipboard.
- **Remover** o bloco "rebalance affected measures" inteiro (linhas 137-154): no novo modelo, paste só insere; não preenche, não corta, não colapsa.
- Manter import de `createRest` se ainda for usado em outros lugares; remover se não.

A semântica nova do paste fica: "insira as notas do clipboard a partir da posição selecionada, indo pros próximos compassos quando o atual transbordar". Se o último compasso transbordar, ele fica vermelho (overflow visível).

### `js/editor-mouse.js`

Adicionar terceiro passe ao `_hitTest()`:

```js
// Third pass: empty-measure anchors (no staveNote)
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
```

Isso vai DEPOIS do segundo passe, então só dispara quando não houve hit em nenhuma nota real.

## Não tocados

- `js/app.js`
- `js/playback.js` — playback é nota a nota, ignora barras de compasso.
- `js/storage.js` — formato JSON não muda.
- `js/undo-redo.js` — clones via `JSON.parse(JSON.stringify())` continuam corretos.
- `js/editor-navigation.js`
- `js/editor-chord.js`
- `js/export.js`
- `css/style.css` — cores aplicadas via `setStyle` do VexFlow, não via CSS.

## Edge cases

| Caso | Comportamento |
|---|---|
| Score novo (compassos vazios) | Staves desenhados sem notas. Clique seleciona o compasso (azul claro). Digitar `c` cria a primeira nota. |
| Compasso `[Cq]` em 4/4 | Renderiza só a seminima. VexFlow SOFT mode tolera. |
| Trocar `Cq` por `Cw` em compasso `[Cq, Dq, Eq, Fq]` | Total = 7. Compasso fica vermelho. |
| Deletar única nota | Compasso fica vazio. |
| Deletar uma de várias notas | Vira pausa de mesma duração. |
| Deletar pausa explícita | Pausa some. |
| Playback com overflow | Toca normal. Cursor pode dessincronizar visualmente entre staves. |
| Exportar com vermelho | Sai vermelho no PDF/PNG. |
| Treble com 5 beats, bass com 4 | Treble vermelho, bass normal. |
| Importar JSON antigo | Renderiza igual antes. Sem migração. |
| Compasso `[Cq, restQ, Eq, Fq]` → deletar a pausa | Pausa some, vira `[Cq, Eq, Fq]` (3 beats, underfull). Sem vermelho. |
| Compasso com várias pausas, deletar todas uma a uma | Cada delete remove uma pausa por vez (regra 2 do `removeNote`). Quando sobra a última, ela some pelo branch da regra 1. Compasso fica vazio. |

## Plano de teste manual

1. Criar score novo → compassos vazios → clique seleciona → digitar `c` cria a primeira nota.
2. Adicionar uma seminima C → mudar duração para semibreve → **deve funcionar** (era o bug original).
3. Encher compasso `[Cq, Dq, Eq, Fq]` → mudar Cq para Cw → compasso fica vermelho → mudar Cw de volta para Cq → vermelho some.
4. Deletar única nota de um compasso → fica vazio.
5. Deletar uma de várias notas → vira pausa.
6. Inserir pausa com R → deletar essa pausa → some.
7. Tocar (Espaço) score com overflow → playback continua sem crash.
8. Exportar PDF → vermelho aparece.
9. Carregar score antigo do `localStorage` → renderiza.
10. Undo/Redo: criar nota, deletar, undo → nota volta. Redo → some de novo.

## Rejeitadas

- **Diferenciar pausas explícitas vs. auto-fill via `note.explicit`**: muito mais código, não resolve o problema fundamental (usuário quer compassos vazios, não compassos cheios de pausas "fantasmas").
- **Modelo "track" sem barras**: refactor enorme, fora de escopo.
- **Bloquear overflow ou cortar na borda**: usuário escolheu permitir overflow + sinal vermelho.
