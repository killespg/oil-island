# Pesquisa aplicada de combate — Oil Island

Consolidação de 2026-10-01. Estas cinco notas preservam as fontes primárias, decisões e verificações de cada frente. Algumas foram produzidas antes de decisões posteriores do usuário; os avisos no início de cada arquivo identificam esse histórico. O comportamento atual está no [README do jogo](../../README.md), no [design integrado](../../DESIGN.md) e no código. O [relatório final de validação](../../evidencias/oil-island-validation.json) é produzido separadamente na integração; os resultados parciais abaixo não o substituem.

## Contrato atual

| Tema | Comportamento integrado | Evidência / detalhe |
| --- | --- | --- |
| Vida e rounds | 300 de vida por lutador; 120 s por round; energia e postura até 100. | [Defesa e mobilidade](research-defense-mobility.md) |
| Entrada | WASD + J/K/L/I como esquema principal; Shift esquiva, Espaço pula, F corre e R usa super. Mouse, toque e Q/E são alternativas. | [Controles](research-agile-controls.md) |
| Câmera | Alvo fixado em toda nova partida; ajuste manual limitado durante lock, órbita livre completa ao soltá-lo. Câmera usa volumes do cenário e enquadra ambos os lutadores. | [Câmera](research-souls-camera.md) |
| Buffer | Uma intenção por até 180 ms; a mais recente substitui a anterior. Guarda segurada tem prioridade. | [Combate inicial](research-fast-combat.md), [defesa atual](research-defense-mobility.md) |
| Continuação ofensiva | Contato confirmado, a partir de `windup + 0,06 s`; até oito ações se o último contato causou dano ou três se foi bloqueado. Supers/canais não abrem essa continuação. | [Defesa e mobilidade](research-defense-mobility.md) |
| Saída defensiva | Esquiva, salto e guarda podem cancelar recuperação inclusive após whiff. Preparação/fase ativa e hitstun continuam comprometidos; o óleo mantém sua exceção após startup. | [Defesa e mobilidade](research-defense-mobility.md) |
| Escape | A proteção após três hits continua. Oito ações possíveis não garantem oito acertos contra um rival que reage. | [Defesa e mobilidade](research-defense-mobility.md) |
| Recompensas | Acerto básico: +6 energia. A partir do segundo hit, +3 energia/+4 postura uma vez por ação. Esquiva perfeita: +10/+12 uma vez por ataque adversário. | [Defesa e mobilidade](research-defense-mobility.md) |
| Transições | Ataques após corrida/esquiva carregam `_entryFrom`; preparação no fim da esquiva espera seu término. | [Defesa](research-defense-mobility.md), [animação](research-combo-animation.md) |
| Poses | Oito contatos básicos e quatro chutes por personagem; blend de 38 ms; pico no windup; anatomia e identidade preservadas. | [Animação](research-combo-animation.md) |
| HUD e intensidade | Rota J/K/L/R, janela de combo, comando preparado, postura e avisos defensivos. FOV limitado a 52–61°; movimento reduzido desliga variação e rotação de impacto. | [Design integrado](../../DESIGN.md), `game.js`, `combat-feedback.js` e `scene.js` |
| Identidade visual | Veterano/Pixel mais robustos e eretos; Veterano com jeans azul. Óleo do Titã por cinco segundos/20 projéteis; hélice do Mímico e quadrupedia do Orelha preservadas. | [README](../../README.md), [animação](research-combo-animation.md) |
| Alcance | Corpo a corpo ampliado em 28%; especiais/supers radiais do Mímico, 20%. Cone, altura e direção ainda limitam contato. Óleo/vento conservam o percurso anterior. | `combat.js` e `tests/reach-intro-tests.cjs`; números e danos nas notas anteriores são históricos. |
| Orla Brava | Cinco jovens genéricos de pele clara com tacos fora da área de luta. Intro de 6,2 s com Orelha em qualquer lado, só no primeiro round e fora do treino. Sem dano ambiental. | `arena-seaside.js`, `introKind` e testes de intro/cenário; [README](../../README.md) |

O limite global de **três** da primeira pesquisa foi substituído pelo contrato **oito com dano / três contra guarda**. A antiga proibição de saída defensiva em whiff também foi substituída pelo cancelamento na recuperação. A proteção após três impactos é outro mecanismo e permanece. Os nomes internos Iniciante/Executor em tabelas de ensaio correspondem aos rótulos Recruta/Lenda da interface.

## Cinco frentes e fontes

| Pesquisa | Questão principal | Fontes primárias registradas |
| --- | --- | --- |
| [1. Resposta e confirmação](research-fast-combat.md) | Consumir intenção recente na primeira janela legal e preservar reação da IA. | Kyle Pulver sobre input buffering; postmortem do próprio desenvolvedor de Rage; Mihir Sheth/Santa Monica na GDC; Epic; Bandai Namco. |
| [2. Câmera de duelo](research-souls-camera.md) | Alinhar direção visual/movimento, enquadrar dois corpos e evitar obstáculos. | Three.js MathUtils; documentação oficial Unity Cinemachine sobre acompanhamento, oclusão e enquadramento de grupo. |
| [3. Controles ágeis](research-agile-controls.md) | Mouse simultâneo, toque e dispositivos híbridos sem perder bordas de input. | W3C Pointer Events; MDN; web.dev; manual oficial de Elden Ring. |
| [4. Defesa e mobilidade](research-defense-mobility.md) | Combos longos, recuperação, defesa, recursos e transições legais. | Guias oficiais Bandai Namco de Elden Ring; Robert Conkey/Activision no PlayStation Blog sobre Sekiro. |
| [5. Animação progressiva](research-combo-animation.md) | Contatos variados, timing legível e continuidade das articulações. | Mariel Cartwright/Lab Zero e Shawn Allen/NuChallenger na GDC; animadores e equipe de clareza da Riot; Michael Lyndon/SideFX na GDC. |

Os links diretos estão junto das interpretações em cada nota. Tempos, limites, recursos e escolhas de implementação do Oil Island são identificados como decisões locais; as referências não demonstram uma cópia dos sistemas internos de Souls, God of War ou jogos da Riot. PDFs indisponíveis e consultas restritas ao resumo/texto indexado também são explicitados.

## O que as evidências provam

As notas contêm resultados produzidos pelos responsáveis em suas respectivas etapas. Testes de combate/replay verificam contratos determinísticos; testes de câmera usam matrizes reais sem renderizador; a auditoria de poses usa rigs e deformação reais na CPU; testes de entrada usam o código real com DOM/renderer de teste. Nenhum desses resultados sozinho demonstra sensação de combate, ausência de toda interpenetração visual, conforto da câmera, latência física ou desempenho sustentado.

As contagens parciais não devem ser somadas para obter um total da entrega: há suítes repetidas, arquivos alterados entre execuções e verificações de natureza diferente. A auditoria local de poses citada na nota 5 foi executada em `../work/audit-combo-poses.cjs`, fora dos arquivos distribuídos do jogo; seus números são um registro da etapa. A suíte integrada e a revisão gráfica são reportadas em [evidencias/oil-island-validation.json](../../evidencias/oil-island-validation.json).

Testes novos no repositório incluem `fast-combat-tests.cjs`, `defense-mobility-tests.cjs`, `camera-tests.cjs`, `combat-feedback-tests.cjs`, `reach-intro-tests.cjs` e `seaside-cinematic-tests.cjs`. A inclusão no comando de testes pode ser conferida no [package.json](../../package.json). A validação gráfica final é feita separadamente via CUA; registros de Playwright da etapa de controles são históricos. Não há nesta consolidação nova execução de navegador, playtest humano, teste em celular físico nem publicação.
