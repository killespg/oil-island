# Oil Island — pesquisa de resposta e encadeamento do combate

> Registro da primeira etapa de 2026-10-01, preservado como pesquisa e evidência histórica. O contrato vigente foi ampliado pela [pesquisa de defesa e mobilidade](research-defense-mobility.md): 300 de vida, 120 s, limite de oito ações confirmadas com dano e três em guarda; defesas podem cancelar a recuperação inclusive de whiffs. O limite global de três e a proibição de cancelamento defensivo do super abaixo descrevem a etapa anterior. O buffer continua em 180 ms e a confirmação ofensiva em `windup + 0,06 s`. Consulte o [índice atual](README.md) e o [relatório integrado](../../evidencias/oil-island-validation.json) para a entrega final.

Responsável: agente 1/5, research_fast_combat. Consulta: 2026-10-01. Escopo: combat.js, tests/fast-combat-tests.cjs e, mediante autorização do agente raiz, somente o fixture de preparação do teste de fuga da IA em tests/combat-tests.js.

## Resultado implementado nesta primeira etapa

O próximo golpe aceito agora começa na primeira janela legal de confirmação, sem exigir um segundo toque. O buffer tem um único slot de 180 ms, substituído pelo comando mais recente, e é consumido uma vez. A guarda segurada tem prioridade sobre esse golpe pendente tanto na confirmação quanto no fim da recuperação. Não alterei dano, alcance, duração das animações, custo de energia nem as janelas de invulnerabilidade.

O limite de três golpes por sequência de cancelamentos passou a contar também contato com guarda. Antes, o contador dependia do timer de combo de dano: bloqueios não atualizavam esse timer, e o contador voltava a um a cada continuação. Após três golpes, o quarto espera a recuperação completa. Uma nova sequência depois da recuperação começa em um.

A velocidade nova revelou outro defeito: a IA reiniciava a própria latência ao observar cada nova animação de uma sequência. Socos de cerca de 167 ms podiam impedir para sempre uma reação normal de 230 ms. A decisão em curso agora atualiza a ameaça observada sem reiniciar o relógio. Se o tempo termina durante hitstun, ela aguarda a retomada legal do controle; se o adversário deixa de atacar ou sai da distância de observação, é descartada. Não há leitura de teclas ou do buffer, e não foram reduzidas as latências por dificuldade.

## Evidências primárias e aplicação

### 1. Buffer deve executar uma intenção recente no primeiro momento legal

Kyle Pulver explica sua implementação de buffer de salto como um timer curto, consumido no salto, para evitar exigir um comando no frame exato em que o movimento se torna permitido. Distingue um novo pressionamento de simplesmente manter o botão apertado. No exemplo dele, o valor é seis frames; esse número pertence ao jogo e à taxa fixa dele, não é uma prescrição de combate Souls.

Fonte: [Kyle Pulver — Jump Input Buffering](https://kpulv.com/106/Jump_Input_Buffering/), 2013.

Aplicação nossa: corrigir o consumo do buffer em combat.js antes de acelerar mais as animações. Os 180 ms são uma escolha local a validar jogando, não um número atribuído à FromSoftware ou Santa Monica. Correspondem a aproximadamente onze frames de apresentação a 60 Hz; a simulação continua contando segundos em seus subpassos determinísticos.

### 2. Resposta rápida e recuperação vulnerável podem coexistir

No relato do desenvolvimento de Rage, James Rowbotham separa o começo imediato da resposta do personagem de uma breve exposição depois do golpe para permitir punição. Relata que alterações pequenas de frames afetam muito o resultado e que avaliava balanceamento jogando e observando outras pessoas. Para a IA, manteve os mesmos atributos de saúde, velocidade e golpes dos jogadores.

Fonte: [James Rowbotham — Rage Development Postmortem](https://www.gamedeveloper.com/design/-rage-development-postmortem), seções “Responsiveness is key” e “Balancing”, 2017. É relato do próprio desenvolvedor, não uma análise jornalística de terceiros.

Aplicação nossa: preservar recuperação do golpe que errou e compromisso do super, mas remover atraso artificial de uma continuação já confirmada. A IA deve responder a sinais visíveis usando recursos normais. Testes provam contratos; não substituem avaliação humana da sensação.

### 3. Intenção, alvo e leitura da distância precisam continuar claros com câmera próxima

Mihir Sheth descreve como mudanças de perspectiva em God of War exigiram revisar seleção de alvo, aproximação e deslocamento das reações de impacto. O uso isolado da mira central foi insuficiente para interpretar intenção de ataque corpo a corpo. Aproximações laterais fortes e grandes deslocamentos podiam desorientar ou tirar o inimigo da tela; a equipe refinou esses comportamentos.

Fonte: [Mihir Sheth / Santa Monica Studio — Evolving Combat in God of War for a New Perspective, GDC 2019](https://media.gdcvault.com/gdc2019/presentations/Sheth_Mihir_EvolvingCombat.pdf), páginas 94–114 e 128–138. Fonte original da palestra, consultada como texto do PDF.

Aplicação nossa: manter a direção do golpe comprometida no lançamento, permitir que a próxima ação escolha a direção atual do rival e conservar a câmera fora da autoridade de hitboxes. Não transportar automaticamente técnicas de assistência de um jogo PvE para este duelo PvP. Os agentes de câmera podem melhorar enquadramento e controle sem mudar quem acerta quem.

### 4. Ações discretas e contínuas têm contratos distintos

A documentação de input da Epic diferencia eventos de começo de ação, úteis para uma ocorrência ao pressionar, de avaliação contínua, útil enquanto o input permanece ativo. Esse modelo ajuda a separar intenção de um golpe, guarda mantida e movimento.

Fonte: [Epic Games — Input Overview in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/input-overview-in-unreal-engine).

Aplicação nossa: o buffer recebe ações discretas de FightSim.act; input.block permanece contínuo e pode substituir a decisão ofensiva antiga. Controles de teclado, mouse, toque e pacotes online devem preservar esse mesmo significado. Não houve dependência nova de engine.

### 5. Mobilidade, guarda e gerenciamento de recursos são partes do combate

O guia oficial de Elden Ring descreve esquiva direcional, passo para trás com direcional neutro, regeneração de stamina e bloqueio de ações que consomem um recurso esgotado. Também apresenta contra-ataque após guarda e parry como oportunidades diferentes. A fonte não publica uma janela universal de input buffer ou autorização de cancelamento irrestrito.

Fonte: [Bandai Namco — Elden Ring Starter Guide](https://en.bandainamcoent.eu/elden-ring/news/elden-ring-starter-guide-tips-know-playing-the-game), 2021.

Aplicação nossa: usar a referência Souls para clareza de direção, compromisso e decisão defensiva; preservar os contratos próprios do elenco, incluindo a esquiva neutra para frente do Orelha. O combate rápido não precisa copiar tempos exatos de outro jogo.

## Alternativas avaliadas

1. Reduzir novamente todos os tempos de animação: aumentaria cadência, mas não resolveria comandos aceitos esperando uma animação inteira. Também mudaria leitura de ataques e balanceamento de todos os personagens.
2. Cancelar qualquer golpe em qualquer momento: aumentaria controle instantâneo, mas eliminaria parte do risco de errar e exigiria redesenhar energia, defesa e punição.
3. Executar uma intenção recente assim que a regra atual já a permite: caminho escolhido. Mantém timing e risco existentes, corrige buffer, dá prioridade a guarda e limita sequências de contato.

## Contrato histórico entregue à etapa de defesa

- inputBufferDuration: .18 s; confirmDelay: .06 s; maxChainLength: 3.
- canChain exige golpe normal/especial não canalizado, contato, ausência de stun e actionTime >= windup + .06.
- A janela é relativa ao começo da fase ativa, como antes. Não são 60 ms adicionais depois do instante real de impacto.
- Buffer ofensivo único; último golpe válido substitui o anterior. Não há fila de três comandos.
- A guarda segurada impede consumo ofensivo automático e vence no término natural da ação.
- Super continua sem cancelamento ofensivo/defensivo antecipado nesta alteração.
- Esquiva não foi alterada; agente de defesa pode acrescentar seu próprio contrato de buffer. Se compartilhar _buffer, deve distinguir o tipo e evitar que canChain inicie uma esquiva pela rota ofensiva.
- Receber dano, parry ou quebra de guarda continua limpando o buffer.
- Proteção de escape após três hits permanece; as novas regras não mexem em _hurtChain ou _invuln.
- Óleo do Titã preservado: windup .18, active 5, duration 5.3, vinte projéteis de óleo com intervalo .25, custo44, direção não homing, interrupção por defesa/esquiva/hit conforme regras existentes.
- Cutscene de helipad preservada em 6.2 s no primeiro round fora de treinamento.
- Sem estado novo fora de snapshots. _buffer, _chainIndex e _aiReaction já eram serializados. Replay de um comando pendente foi comparado por igualdade de snapshot.

## Testes e limites desta primeira etapa

- tests/fast-combat-tests.cjs: 12/12 passando. Quatro testes iniciais reproduziram falhas antes da correção; depois foram adicionados casos de IA, com falhas confirmadas antes dos respectivos ajustes.
- npm test: execução completa passou após o ajuste pontual do fixture autorizado pelo agente raiz.
- O fixture antigo de fuga depois de dois golpes usava uma IA com decisões periódicas suspensas, mas ainda deixava as reações visuais ativas. Agora os dois golpes reais de preparação usam stepPlayers com inputs neutros. A prova de fuga continua usando step com IA ativa e os mesmos asserts de direção, energia, cooldown, dificuldade e energia insuficiente.
- Ensaio determinístico existente de spam de soco, seeds1–12: vitórias da CPU easy0, normal1, hard12, nightmare12. Dano total do jogador normal2902, hard1833, nightmare1291. Isso é controle de regressão contra uma estratégia específica, não uma classificação universal da dificuldade.
- Replay, óleo, parry, whiff, golpe em oito direções, escape do terceiro hit, controles e rede passaram nas suítes atuais.
- Não fiz playtest humano, medição de latência ponta a ponta em dispositivo móvel nem teste em dois navegadores conectados nesta subtask. O agente raiz deve integrar o novo arquivo ao comando npm test; package.json ficou fora deste escopo.

## Próximo ajuste recomendado nesta etapa, depois implementado

O agente de defesa deve investigar um buffer curto para esquiva no fim de recuperação/hitstun e prioridade explícita de intenção defensiva sobre ataque antigo. Deve preservar o custo da esquiva, o cooldown e o fim legal de compromisso. É um complemento à correção ofensiva, não justificativa para invulnerabilidade antecipada.

Esse complemento foi implementado e verificado na [etapa de defesa e mobilidade](research-defense-mobility.md). O texto acima registra a passagem entre etapas, não uma pendência atual.
