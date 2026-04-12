# Design — Shift como modificador para teclas de ferramenta

**Data:** 2026-04-11
**Status:** Aprovado, pronto para implementação

## Problema

Hoje, as teclas de ferramenta (`1-5` para duração, `S/-/N` para acidente, `.` para dotted) fazem **duas coisas ao mesmo tempo**:

1. Modificam a nota atualmente selecionada.
2. Definem o valor padrão para a próxima nota a ser inserida.

Isso é problemático: às vezes o usuário quer apenas mudar a configuração para a próxima nota, sem alterar a nota onde está. Hoje não há como fazer isso — o ato de configurar afeta a seleção atual à força.

## Decisões

1. **Default sem modificador:** apertar uma tecla de ferramenta apenas define o valor para futuras notas. **Não modifica** a nota atualmente selecionada.
2. **Com `Shift` segurado:** apertar uma tecla de ferramenta modifica **apenas** a nota atualmente selecionada. **Não muda** o valor para futuras notas.
3. **Sem seleção + Shift segurado:** no-op (sem feedback, sem erro).
4. **Aplicável a todas as 3 categorias de tecla de ferramenta:** duração (`1-5`), acidente (`S`, `-`, `N`), dotted (`.`).
5. **Detecção via `e.code`:** o handler usa `e.code` (`Digit1`, `KeyS`, `Period`, etc.) em vez de `e.key`, porque no Mac Shift e Option mudam o caractere de `e.key` (ex: `Shift+1` vira `'!'`, `Option+S` vira `'ß'`).

## Mudanças por arquivo

### `js/app.js` (único arquivo tocado)

No handler de keydown (perto da linha 422), refatorar 3 blocos: duração, acidente, dot.

#### Bloco de duração

**Antes:**
```js
const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
if (!ctrl && !shift && durMap[key]) {
  e.preventDefault();
  if (hasSel) changeDurationOfSelected(durMap[key]);
  setDuration(durMap[key]);
  syncToolbar();
  return;
}
```

**Depois:**
```js
const durCodeMap = { 'Digit1': 'w', 'Digit2': 'h', 'Digit3': 'q', 'Digit4': '8', 'Digit5': '16' };
if (!ctrl && !alt && durCodeMap[e.code]) {
  e.preventDefault();
  if (shift) {
    if (hasSel) changeDurationOfSelected(durCodeMap[e.code]);
  } else {
    setDuration(durCodeMap[e.code]);
    syncToolbar();
  }
  return;
}
```

#### Bloco de acidente

**Antes:** três `if` separados (um por tecla `s`, `-`, `n`), cada um chamando `changeAccidentalOfSelected` + `toggleAccidental` + `syncToolbar`.

**Depois:** um único bloco com mapa por `e.code`:
```js
const accCodeMap = { 'KeyS': '#', 'Minus': 'b', 'KeyN': 'n' };
if (!ctrl && !alt && accCodeMap[e.code]) {
  e.preventDefault();
  if (shift) {
    if (hasSel) changeAccidentalOfSelected(accCodeMap[e.code]);
  } else {
    toggleAccidental(accCodeMap[e.code]);
    syncToolbar();
  }
  return;
}
```

#### Bloco de dot

**Antes:**
```js
if (!ctrl && !shift && key === '.') {
  e.preventDefault();
  if (hasSel) toggleDot();
  toggleDotMode();
  syncToolbar();
  return;
}
```

**Depois:**
```js
if (!ctrl && !alt && e.code === 'Period') {
  e.preventDefault();
  if (shift) {
    if (hasSel) toggleDot();
  } else {
    toggleDotMode();
    syncToolbar();
  }
  return;
}
```

### Não tocados

- `js/editor-modify.js` — `changeDurationOfSelected`, `changeAccidentalOfSelected`, `toggleDot` já existem e funcionam. Não precisam mudar.
- `js/editor.js` — `setDuration`, `toggleAccidental`, `toggleDotMode` já existem.
- Todos os outros arquivos.

## Edge cases

| Caso | Comportamento |
|---|---|
| Sem seleção + tecla sem shift | Define futuro normalmente. Toolbar atualiza. |
| Sem seleção + Shift+tecla | No-op completo. Toolbar não muda. |
| Seleção numa nota real + tecla sem shift | Define futuro. Nota atual **não muda**. |
| Seleção numa nota real + Shift+tecla | Nota atual modificada. Futuro **não muda**. |
| Seleção em compasso vazio (âncora) + tecla sem shift | Define futuro normalmente. |
| Seleção em compasso vazio (âncora) + Shift+tecla | Funções `changeDurationOfSelected`/etc já têm guard `if (!note)` → no-op. |
| Seleção múltipla + Shift+tecla | Todas as notas selecionadas são modificadas (já é o comportamento de `changeDurationOfSelected` que itera `allSel`). |
| `Shift+1` (digit no top row) | `e.code === 'Digit1'`, `e.shiftKey === true` → branch shift dispara. |
| `Shift+S` | `e.code === 'KeyS'`, `e.shiftKey === true` → branch shift dispara. |
| `Shift+.` | `e.code === 'Period'`, `e.shiftKey === true` → branch shift dispara. |
| Numpad (não-MacBook) | Não suportado por enquanto — `Numpad1`, etc., não estão no map. (Pode ser adicionado no futuro se alguém pedir.) |

## Plano de teste manual

1. Crie score novo. Sem nada selecionado, aperte `1` → toolbar muda para semibreve, nenhuma nota afetada.
2. Digite `c` → seminima C aparece (na duração definida no toolbar; se você apertou `1` antes, deve ser semibreve).
3. Selecione uma seminima C. Aperte `1` (sem shift) → toolbar muda para semibreve, mas a **nota continua sendo seminima**.
4. Mesma seleção. Aperte `Shift+1` → **nota vira semibreve**, toolbar **continua** marcando o que estava antes.
5. Selecione uma nota qualquer. Aperte `S` (sem shift) → toolbar marca sustenido, nota não muda.
6. Mesma nota. Aperte `Shift+S` → nota recebe sustenido.
7. Selecione uma seminima. Aperte `.` (sem shift) → toolbar marca dotted, nota não muda.
8. Mesma nota. Aperte `Shift+.` → nota vira seminima pontuada.
9. Sem nenhuma seleção, aperte `Shift+1` → nada acontece (no-op).
10. Selecione múltiplas notas (clique + shift+clique). Aperte `Shift+1` → todas viram semibreve.

## Rejeitadas

- **Inverter o default (atual modifica + define futuro) com modificador para "só futura"**: o usuário escolheu o oposto — default vira "só futuro", modificador vira "só atual". Mais alinhado com a intuição "tecla é configuração, modificador é ação alvejada".
- **Usar Option/Alt como modificador no Mac**: mesmo problema técnico que Shift (muda `e.key` no Mac, gerando caracteres especiais como `ß`, `∞`). Como precisaria de `e.code` em ambos os casos, a escolha vira pura ergonomia, e Shift é mais natural. Alt já é usado para "inserir antes" (Alt+letra).
- **Helper `getToolKey(e)` para abstrair a resolução**: overengineering pra um caso de 9 teclas.
