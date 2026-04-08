# Piano Piece Editor — Design Spec

## Context

Editor de partituras web para uso pessoal. Permite criar, editar e tocar partituras de piano e outros instrumentos diretamente no navegador, sem backend. Salva localmente via localStorage.

## Decisões Técnicas

- **Renderização**: VexFlow (biblioteca open-source de notação musical em SVG)
- **Playback**: Web Audio API com osciladores + envelope ADSR (substituível por soundfonts no futuro)
- **Stack**: HTML + CSS + JavaScript puro (ES modules), sem frameworks, sem build tools
- **Persistência**: localStorage (JSON)

## Arquitetura

```
piano-piece-editor/
├── index.html              — página única
├── css/
│   └── style.css           — estilos da interface
├── js/
│   ├── app.js              — inicialização e orquestração
│   ├── score-model.js      — modelo de dados da partitura
│   ├── renderer.js         — renderização via VexFlow
│   ├── editor.js           — interação (mouse + teclado)
│   ├── playback.js         — reprodução com Web Audio API
│   └── storage.js          — salvar/carregar via localStorage
└── lib/
    └── vexflow (via CDN)
```

### Fluxo de dados

```
Editor (mouse+teclado) → Score Model (JSON) → Renderer (VexFlow → SVG)
                                             → Playback (Web Audio)
                          Score Model ↔ Storage (localStorage)
```

O Score Model é a fonte de verdade. O editor modifica o modelo; renderer e playback leem dele.

## Interface (4 zonas)

1. **Barra superior**: nome do app + ações de arquivo (Nova, Salvar, Carregar, Exportar)
2. **Toolbar**: seleção de duração (semibreve→semicolcheia), acidentes (#/b/bequadro), pausa, desfazer/refazer
3. **Área da partitura**: fundo claro (papel), renderizada em SVG pelo VexFlow. Grand staff (clave sol + fá) por padrão. Notas clicáveis, nota selecionada destacada em azul.
4. **Barra de playback**: Play/Stop, barra de progresso, controle de BPM

## Modelo de Dados (Score Model)

```json
{
  "title": "Título",
  "composer": "Compositor",
  "tempo": 120,
  "timeSignature": { "beats": 4, "beatValue": 4 },
  "keySignature": "C",
  "staves": [
    {
      "clef": "treble",
      "measures": [
        {
          "notes": [
            { "keys": ["c/4"], "duration": "q" },
            { "keys": ["e/4", "g/4"], "duration": "h" },
            { "type": "rest", "duration": "q" }
          ]
        }
      ]
    },
    {
      "clef": "bass",
      "measures": [...]
    }
  ]
}
```

### Entidades

- **Score**: título, compositor, tempo, fórmula de compasso, armadura de clave, lista de staves
- **Staff**: clave (treble/bass), lista de measures
- **Measure**: lista de notes
- **Note**: keys (pitch no formato "nota/oitava"), duration ("w"=semibreve, "h"=mínima, "q"=semínima, "8"=colcheia, "16"=semicolcheia), type ("rest" para pausas), dynamics (pp/p/mp/mf/f/ff, opcional)

## Interação

### Mouse
1. Selecionar duração na toolbar
2. Clicar na pauta — posição Y determina o pitch, posição X determina o compasso/posição
3. Nota inserida, partitura re-renderiza

### Atalhos de teclado

| Ação | Atalho |
|------|--------|
| Notas | C D E F G A B |
| Durações | 1(semibreve) 2(mínima) 3(semínima) 4(colcheia) 5(semicolcheia) |
| Oitava +/- | Shift+Up / Shift+Down |
| Sustenido/Bemol | S / F |
| Pausa | R |
| Deletar nota | Delete / Backspace |
| Navegar | Left / Right |
| Play/Stop | Space |
| Desfazer/Refazer | Cmd+Z / Cmd+Shift+Z |
| Ligadura | T |

## Playback

- **Motor**: Web Audio API — OscillatorNode com envelope ADSR (Attack, Decay, Sustain, Release)
- **Scheduler**: agenda notas usando `audioContext.currentTime` para timing preciso
- **Cursor visual**: barra/destaque azul acompanha a nota sendo tocada
- **Dinâmicas**: volume (gainNode) varia conforme marcações pp→ff
- **Extensibilidade**: interface abstrata permite trocar oscilador por soundfont no futuro sem alterar o resto

## Storage

- **Salvar**: serializa Score Model para JSON → `localStorage.setItem('scores', ...)`
- **Carregar**: lista de partituras salvas com diálogo de seleção
- **Nova**: cria partitura em branco com defaults (4/4, Dó Maior, 120 BPM, grand staff)
- **Exportar**: download do JSON como arquivo `.json`

## Funcionalidades v1

- [x] Notas + pausas com durações (semibreve a semicolcheia)
- [x] Grand staff (clave de sol + fá)
- [x] Armadura de clave e fórmula de compasso configuráveis
- [x] Acidentes (sustenido, bemol, bequadro)
- [x] Ligaduras
- [x] Dinâmicas (pp, p, mp, mf, f, ff)
- [x] Playback com Web Audio API
- [x] Cursor visual durante playback
- [x] Salvar/carregar via localStorage
- [x] Exportar como JSON
- [x] Desfazer/refazer (undo/redo)
- [x] Atalhos de teclado

## Verificação

1. Abrir `index.html` no navegador — interface carrega sem erros
2. Adicionar notas clicando na pauta — notas aparecem corretamente
3. Usar atalhos de teclado para inserir notas — funciona
4. Pressionar Play — música toca com timing correto
5. Salvar e recarregar a página — partitura persiste
6. Exportar JSON — arquivo válido com estrutura correta
