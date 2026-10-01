# Oil Island — defesa, mobilidade e sequências longas

> Contrato vigente de defesa e recursos em 2026-10-01. Substitui os limites da [primeira etapa de combate](research-fast-combat.md): oito ações com dano / três em guarda e saída defensiva na recuperação, inclusive após erro. Números de alcance e resultados de ensaios abaixo pertencem à execução desta etapa; uma revisão posterior de alcance corpo a corpo é registrada no [índice atual](README.md) e no [relatório integrado](../../evidencias/oil-island-validation.json). Os rótulos internos Iniciante/Executor dos ensaios correspondem a Recruta/Lenda na interface.

Responsável: agente 4/5, research_defense_mobility. Consulta: 2026-10-01. Escopo: `neon-clash/combat.js`, `tests/defense-mobility-tests.cjs` e atualização autorizada das expectativas de vida/tempo e contratos defensivos em `tests/combat-tests.js`, `tests/roster-combat-tests.cjs` e `tests/fast-combat-tests.cjs`.

## Resultado

Os duelos começam com 300 de vida e 120 segundos por round. Energia e postura continuam limitadas a 100. O combate permite até oito ações em sequência por contato com dano e até três contra guarda. Uma esquiva ou um salto pressionado pouco antes da retomada legal do controle espera até 180 ms; essa aceitação não gasta energia nem concede invulnerabilidade antecipadamente. A direção da esquiva fica registrada no pressionamento.

A especificação mais recente permite cancelar a recuperação de golpes, inclusive os que erraram, com esquiva, salto ou guarda. Startup e fase ativa permanecem comprometidos. Isso substitui a regra anterior de exigir contato para cancelar defensivamente. O cancelamento ofensivo confirmado continua sendo uma regra separada, a partir de `windup + .06`.

## Fontes primárias e decisões

### Bandai Namco — input buffering e compromisso

O guia oficial de combate de Elden Ring explica que um comando pode aguardar brevemente a próxima oportunidade e alerta que repetição indiscriminada de esquiva pode produzir uma ação indesejada depois. Também descreve compromisso com a animação de ataque. Não fornece duração universal de buffer aplicável a este jogo.

Fonte: [ELDEN RING Introduction Part 4 — Combat Guide](https://www.bandainamcoent.com/news/elden-ring-introduction-part-4-combat-guide), 19/07/2023, seção Input Buffering.

Aplicação: um único slot compartilhado entre intenção ofensiva e defensiva, substituído pelo comando mais recente. Nada de fila de várias esquivas. O valor local de 180 ms acompanha o buffer ofensivo já existente; a simulação mantém a oportunidade legal de cada ação. A exceção de cancelar recovery é uma decisão expressa para Oil Island, não uma afirmação sobre a implementação de Elden Ring.

### Bandai Namco — direção, stamina e parry

O guia inicial descreve esquiva no sentido do direcional, passo para trás com direcional neutro, regeneração de stamina e indisponibilidade de ações quando falta o recurso. Apresenta parry e contra-ataque após guarda como oportunidades distintas.

Fonte: [ELDEN RING Starter Guide](https://en.bandainamcoent.eu/elden-ring/news/elden-ring-starter-guide-tips-know-playing-the-game), 10/11/2021, seções Stamina Gauge, Roll, Step Back, Parry e Guard Counter.

Aplicação: preservar a direção explícita em oito sentidos, sem depender da câmera da simulação. Os quatro humanos recuam quando o direcional está neutro; Orelha avança, conforme seu contrato próprio. A regeneração não substitui o pagamento atômico da esquiva. Aparar continua exigindo uma pressão recente de guarda e tem cooldown próprio.

### Robert Conkey, produtor da Activision — defesa ativa e reposicionamento

O produtor de Sekiro descreve combinar deflexões e ataques, aprender os ataques adversários e usar reposicionamento para controlar o combate. Salienta que depender exclusivamente de esquivas é insuficiente contra oponentes difíceis. É orientação do produtor, não uma tabela de frames ou estudo quantitativo.

Fonte: [How to Survive Sekiro: Shadows Die Twice](https://blog.playstation.com/2019/03/21/how-to-survive-sekiro-shadows-die-twice-out-tomorrow-on-ps4/), PlayStation Blog, 21/03/2019.

Aplicação: conservar decisões diferentes entre guarda, parry, salto e esquiva, além de uma oportunidade real de fuga em sequências longas. Recompensas de energia/postura para combos e esquiva perfeita são escolhas locais solicitadas para Oil Island; os valores não são atribuídos a Sekiro.

## Contrato exato de defesa

- Esquiva: custo 15; duração .28 s; invulnerabilidade .16 s; cooldown .58 s contado do começo da esquiva; velocidade inicial 23 multiplicada pelo perfil do personagem, com desaceleração linear. Esses valores não foram acelerados.
- Salto: custo zero, sem invulnerabilidade. Não permite salto duplo; mantém suas condições de altura/velocidade vertical.
- Buffer defensivo: .18 s, apenas quando a próxima oportunidade legal já cabe nessa janela e há energia para o comando. Esquiva e salto não passam pelo consumo de `canChain`. Guarda segurada cancela a intenção pendente. Um novo impacto, parry ou quebra de guarda limpa o buffer pelas rotas existentes.
- A ação só começa depois do hitstun, do cooldown de esquiva e do fim da fase ativa aplicável. Golpes normais, especiais e supers podem ceder sua recuperação, mesmo depois de errar. O óleo do Titã continua cancelável depois de seu startup de .18 s.
- A direção é normalizada e registrada no comando aceito; mudar movimento ou câmera durante a espera não redireciona silenciosamente a esquiva.
- Parry: pressão recente de guarda conserva somente o restante da janela original de .12 s quando a guarda finalmente se torna legal. Não recebe uma nova janela completa depois de uma longa espera. Cooldown .48 s, custo de sucesso 8, restauração de postura 18 e stun do atacante .42 s preservados. Guarda mantida não rearma parry automaticamente.
- Esquiva perfeita exige sobreposição real com alcance/cone/altura de um golpe ativo ou com um projétil durante os frames invulneráveis da esquiva. Recompensa +10 de energia e +12 de postura, limitada a uma vez por serial do ataque adversário. Vinte gotas de uma mesma rajada não produzem vinte recompensas. Esquivar longe de qualquer ataque não premia.
- O evento de apresentação é `perfectDodge`, com `fighter`, `attacker`, `serial`, `move`, `x`, `z`.

## Vida, combos e recuperação de recursos

- `hp/maxHp`: 300 em todos os personagens e dificuldades; treino e reset de round usam o mesmo máximo. A regeneração de treino foi corrigida para usar `maxHp`, evitando reduzir um personagem saudável a 100.
- `timeLeft`: 120 por round. A entrada de helipad continua em 6.2 s no primeiro round fora de treino, sem gastar o relógio de luta.
- `energy/maxEnergy`: 100. Regeneração preservada em 9/s normalmente, 3.5/s guardando e 22/s em treino; sprint custa 12/s. Melhorias de fluxo existentes mantêm seu multiplicador.
- Encadeamento ofensivo: contato real, sem stun, `actionTime >= windup + .06`, golpe não canalizado e não super. Limite oito quando o último contato causou dano e três quando foi bloqueado. Um nono comando recente pode esperar a recuperação completa, reiniciando o estágio em um.
- Escala de dano: redução de 10 pontos percentuais a cada hit, piso de 40%. Nenhum dano-base ou alcance foi aumentado.
- Hits básicos continuam devolvendo 6 de energia ao atacante. A partir do segundo hit de um combo, cada novo serial ofensivo que acertar devolve mais 3 de energia e 4 de postura, uma vez por ação. Especiais, supers e multihits respeitam esse limite; uma rajada inteira só premia a postura ofensiva uma vez.
- A proteção de escape do terceiro hit permanece: invulnerabilidade durante o stun desse hit mais .25 s e empurrão adicional. O defensor pode usar sua retomada para guardar, aparar ou esquivar; oito ações possíveis não significam oito acertos garantidos.
- Entrada após esquiva: um ataque pode ser aceito nos últimos 180 ms da esquiva, começa somente ao terminar a ação e recebe `f._entryFrom = 'dodge'`. Um ataque livre iniciado até 180 ms depois também recebe esse sinal. Entrada de corrida recebe `'sprint'` quando a corrida estava ativa. O valor dura o ataque e é limpo na próxima ação, no fim ou numa interrupção. `attack` inclui `chain` e `entryFrom` para câmera/animação.

## Provas de rotas reais

Os ensaios usam posições iniciais próximas ao canto, alvo passivo e colisões normais. Não teletransportam os lutadores por frame, não alteram hitstun nem forçam flags de contato.

| Rota | Resultado observado |
| --- | --- |
| Veterano: soco, soco, chute, especial, soco, chute, especial, soco | Oito contatos e estágios 1–8; 78 de dano em 300 de vida. |
| Mímico: mesma rota | Oito contatos e estágios 1–8; 55 de dano. |
| Todo o elenco: soco, soco, soco, chute | Quatro ações iniciadas; o quarto golpe muito rápido encontra a proteção após o terceiro hit. |
| Todo o elenco: soco, chute, soco, chute | Quatro ações iniciadas; mesma oportunidade de fuga preservada. |
| Finalização: soco, soco, chute, especial | Quatro hits no Veterano/Mímico; Titã começa a rajada. O especial rápido de Orelha/Pixel pode encontrar a proteção de escape e precisa de ritmo adequado. |

Essas são rotas possíveis em condições específicas. Não se pode anunciar que todas as rotas acertam integralmente contra alguém que reage ou se afasta.

## Bugs reproduzidos e reparados

Nove testes iniciais falharam antes da implementação: oito comportamentos defensivos/buffering e a nova especificação de vida/tempo. O buffer eliminou perdas de comandos perto da recuperação, após hitstun e no fim do cooldown; a pressão recente de guarda deixou de ser esquecida quando ainda faltavam poucos frames para poder bloquear.

Dois casos adicionais foram encontrados durante a verificação. Um salto iniciado de dentro da atualização era sobrescrito como idle antes de sua primeira integração vertical; movimento no chão agora também exige velocidade vertical não positiva. Um subpasso podia cruzar ao mesmo tempo o fim do cooldown e o prazo de 180 ms, apagando uma esquiva aceita exatamente no limite; agora o comando é honrado quando o instante legal estava dentro de sua janela. Ambos tiveram falha reproduzida antes do reparo.

## Serialização

O snapshot genérico já inclui todos os campos de lutador. Novos campos: `_contactBlocked`, `_guardPress`, `_comboRewardSerial`, `_perfectDodgeSerial`, `_entryFrom`, `_entryWindow`. O buffer defensivo reaproveita `_buffer` e acrescenta `x/z` quando é esquiva. `_chainIndex` permanece o estágio autoritativo. `restore` fornece defaults dos novos campos pelo factory de lutador e preserva snapshots antigos.

Testes comparam igualdade completa de snapshots após consumir uma defesa pendente e após uma esquiva perfeita. A autoridade continua independente de câmera, easing, efeitos e poses.

## Verificação

- `tests/defense-mobility-tests.cjs`: 21/21.
- `tests/fast-combat-tests.cjs`: 12/12.
- `tests/roster-combat-tests.cjs`: 27/27.
- `tests/combat-tests.js`: 31/31.
- `node --check combat.js`: passou.
- As expectativas antigas de vida/tempo foram atualizadas sem alterar energia 100 nem enfraquecer os testes de escape, óleo, serialização e reação da IA.

Ensaio determinístico de spam de soco, seeds 1–12 por dificuldade, com limite de 625 segundos por partida: todas as 48 partidas terminaram. A IA usa os mesmos recursos e latências de antes; não houve tuning de dificuldade para produzir os resultados.

| Dificuldade | Dano CPU | Rounds CPU | Vitórias CPU | Dano jogador | Duração média |
| --- | ---: | ---: | ---: | ---: | ---: |
| Iniciante | 1662 | 0 | 0 | 7259 | 69.8 s |
| Combatente | 5855 | 3 | 0 | 7911 | 100.4 s |
| Executor | 7914 | 24 | 12 | 5551 | 90.9 s |
| Pesadelo | 7353 | 24 | 12 | 3615 | 76.8 s |

Com vida triplicada, vitórias agregadas não distinguiam iniciante e normal nesse adversário fixo. O teste agora exige que normal cause mais de 1.5 vez o dano e ganhe mais rounds que iniciante; mantém a exigência de ao menos dez vitórias para hard/nightmare e de dano recebido decrescente nessas dificuldades. É evidência contra uma estratégia específica, não classificação universal de balanceamento.

Não houve playtest humano, medição de latência física ou sessão real entre dois navegadores nesta subtask. Integração de HUD, câmera, poses, feedback sonoro e inclusão da suíte no comando npm test ficam com o agente principal.
