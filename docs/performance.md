# Otimização gráfica — Oil Island 4.2

Revisão de 1º de outubro de 2026, com cinco frentes: renderização, texturas, arenas, política de qualidade e câmera/animação. A física, os modelos e as texturas de referência mantêm sua resolução e identidade. As melhorias procuram reduzir trabalho duplicado e adaptar a carga ao aparelho.

## Geometria e desenho dos cenários

Peças rígidas que se movem juntas são agrupadas por material. A junção preserva índices, incluindo índices de 32 bits para mais de 65.535 vértices; não expande mais cada triângulo em vértices independentes. Espuma e outros efeitos planos usam passagem única; objetos volumétricos continuam com seu tratamento anterior.

| Arena | Submissões potenciais antes → depois | Buffers antes → depois | Redução de buffers |
|---|---:|---:|---:|
| Ilha | 95 → 69 | 4.261.948 → 2.374.300 bytes | 44,3% |
| Clube | 88 → 64 | 7.272.136 → 3.065.000 bytes | 57,9% |
| Orla | 142 → 137 | 5.534.376 → 2.588.116 bytes | 53,2% |
| Heliponto | 62 → 59 | 1.738.716 → 715.276 bytes | 58,9% |

Esses números são um inventário CPU do cenário completo antes do corte pela câmera. Não incluem lutadores, partículas, sombras ou pós-processamento e não representam FPS. Triângulos, materiais, limites e contratos das cutscenes foram preservados. As auditorias reproduzíveis estão em `evidencias/arena-performance-before.json` e `arena-performance-after.json`; execute `npm run audit:arenas` para o inventário atual.

## Texturas e animação

Texturas de roupa, jeans, emblemas e estampa são compartilhadas por URL/configuração entre os dois slots; materiais que mudam por lutador continuam independentes. A textura externa de jeans evita gerar um fallback procedural que seria descartado. O atlas mutável continua separado do fallback para impedir contaminação entre rostos.

Ao instanciar todo o elenco humano nos dois slots, a estimativa de duplicação de texturas evitada é 8,83 MiB, incluindo mipmaps. A criação inicial de canvases cai de 21 para 5; a redução estimada de 8,375 MiB é de alocações acumuladas, não de RAM retida. Esses valores vêm das dimensões e do número de recursos, não de um profiler de memória da placa.

A câmera reutiliza seus volumes de colisão e evita arrays temporários na interseção. A equivalência foi conferida em 2.880 amostras. No menu, o rival invisível deixa de construir/atualizar a pose; os dois lutadores continuam com animação normal durante a partida.

## Qualidade adaptativa

- LQ reduz escala em passos de 0,1 quando a média fica abaixo de 57 FPS, até 0,65. A interface permanece nítida na resolução original.
- HQ em AUTO pode recuar para LQ se continuar abaixo de 50 FPS mesmo na menor escala, sem voltar subitamente para resolução maior.
- Recuperação de escala exige quatro janelas estáveis de pelo menos 58 FPS; promoção para HQ exige três janelas de combate em LQ na escala 1, com uma tentativa por reinicialização da política.
- Menu, intro, pausa, aba oculta e intervalos de suspensão não acumulam autorização para promover qualidade.
- AUTO/HQ/LQ ficam salvos. HQ manual preserva qualidade e escala máximas; LQ manual adapta escala sem tentar HQ. Recuperação WebGL preserva a escala e salva LQ.

As janelas têm dois segundos. A política usa tempo de frame real e não altera o passo fixo da simulação. Ela ajuda a limitar a carga, mas não garante 60 FPS quando a CPU ou a GPU continua saturada na menor escala.

## Medição pelo navegador

O harness `tests/gpu-benchmark.html` executa boate e Orla com Diddy e Orelha, três segundos de aquecimento e 12 segundos de amostra por arena. O combate usa passo fixo de 1/60 s e sequência de ações determinística. A contagem inclui cena, sombras e pós-processamento. O servidor auxiliar `node tests/gpu-benchmark-server.cjs` escuta somente em `127.0.0.1:3001` e não muda a lista de arquivos do servidor de partidas.

O comparativo usa um snapshot local das fontes coletado às 01:32 de 1º de outubro e o código integrado. Resultados brutos, hashes e limitações ficam em `evidencias/oil-gpu-comparison.json`. O snapshot não faz parte do produto; `OIL_BENCH_BASELINE` permite apontar para uma cópia equivalente ao reproduzir a comparação.

Equipamento observado: AMD Radeon RX 7600 via ANGLE/D3D11, WebGL 2, LQ em 1235 × 566 pixels. São amostras curtas em uma máquina com outras abas abertas. Uma primeira amostra atual coincidiu com testes de CPU e foi registrada separadamente; a repetição posterior permite ver essa variação. Não houve validação física em GPU integrada/fraca, nem teste prolongado de aquecimento. Não se pode atribuir diferenças pequenas de FPS somente à otimização.

| Amostra após os testes de CPU | Boate: FPS / chamadas médias | Orla: FPS / chamadas médias |
|---|---:|---:|
| Snapshot anterior, repetição | 154,35 / 123,01 | 149,35 / 189,02 |
| Código atual, repetição | 149,51 / 108,03 | 145,01 / 186,18 |

A mediana de frame ficou em 5,6 ms nas duas versões. O comparativo mostra menos chamadas de desenho, mas **não comprovou ganho de FPS**: a média atual ficou ligeiramente abaixo, dentro deste conjunto curto e sem isolamento de carga. O benefício confirmado é estrutural (buffers, duplicações e submissões), junto à adaptação de resolução coberta pelos testes. A repetição atual reutilizou o cache de cenários; a anterior recarregou a página, portanto a contagem de texturas em memória não é diretamente comparável nesses dois registros.
