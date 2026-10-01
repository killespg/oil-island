# Oil Island — progressão dos combos e continuidade de animação

> Registro da animação em 2026-10-01, integrado ao contrato de oito ações com dano / três em guarda. As contagens de vértices e poses abaixo identificam a execução da auditoria desta etapa e podem mudar quando a geometria é revista. O [índice atual](README.md) reúne as cinco pesquisas; o [relatório integrado](../../evidencias/oil-island-validation.json) registra a verificação final do conjunto.

Pesquisa e implementação: agente 5/5. Consulta e verificação: 2026-10-01.

## Entrega

Os cinco lutadores têm oito poses de contato progressivas para o ataque básico e quatro famílias de chute. Os humanos alternam jab esquerdo, direto direito, gancho no corpo, uppercut, cruzado, gancho amplo, gancho ascendente e finalização por cima. Titã emprega mais peso de tronco; Pixel mantém uma guarda compacta; Mímico acrescenta mãos e cabeça expressivas. Orelha alterna patas, ombradas e avanço baixo mantendo sua anatomia quadrúpede. Seus giros alternam lado e amplitude.

O contato visual agora chega ao máximo exatamente no `windup` da simulação. Antes, a extensão máxima acontecia entre 55 e 105 ms depois dele. A preparação ocupa 42% do windup, seguida de aceleração curta, contato sustentado por até 24 ms e retorno não linear à guarda. Esses tempos são escolhas locais, não valores copiados de outro jogo.

`_entryFrom='dodge'` produz saída abaixada e uppercut no primeiro soco; no chute humano, uma variação circular baixa. `sprint` mantém a inclinação do avanço e entra em um chute com joelho mais recolhido. Orelha tem preparação própria para ambas as entradas. Um blend de 38 ms parte das articulações exibidas no frame anterior: evita voltar instantaneamente à guarda ao confirmar outro ataque ou sair da mobilidade. A duração e a autorização para atacar continuam pertencendo à simulação.

Veterano e Pixel também receberam guarda mais equilibrada e tronco ereto: inclinação de repouso de 0,025 rad, em vez de 0,115 rad no Veterano. A torção do tronco nos golpes básicos não excede 0,30 rad. As mudanças de volume/anatomia no arquivo de construção dos humanos pertencem à integração do agente raiz.

## Fontes primárias e decisões

1. [Mariel Cartwright / Lab Zero — Powerful and Effective Animation for 2D/3D Games, GDC 2014](https://www.gdcvault.com/play/1021657/Powerful-and-Effective-Animation-for). A palestra da animadora de Skullgirls trata de keyframes, antecipação, timing e smears sob restrições reais de gameplay. O resumo oficial foi consultado; o PDF completo não abriu nesta ferramenta. Aplicação: construir contatos e silhuetas diferentes dentro das durações existentes. Não usei isso como justificativa para alongar membros nem para atribuir um número específico de frames à fonte.

2. [Shawn Allen / NuChallenger — Animating a Complex 2D Fighting Game 3 Frames at a Time, GDC 2021](https://www.gdcvault.com/play/1027125/Animation-Summit-Animating-a-Complex). O resumo original descreve a busca por muitos ataques, estilos individuais e impactos legíveis com poucos frames. Aplicação: variedade pela combinação de mão, altura, arco, apoio e postura, sem simplesmente acelerar repetidamente o mesmo soco. O número de oito etapas pertence ao contrato deste jogo.

3. [Sean Yeung e Einar Langfjord / Riot — Modernizing the Monk, 2024](https://www.leagueoflegends.com/en-gb/news/dev/dev-modernizing-the-monk/), seção Animation. Os animadores de Lee Sin descrevem timing e espaçamento assimétricos para dar peso aos socos; também explicam a correção de poses que deslocavam o personagem para fora da hitbox parada. Aplicação: preparação, drive, contato e recuperação com ritmos diferentes; pequenas compensações de postura, sem alterar `root`, alcance ou hitboxes. O relato de arte/rigging no mesmo artigo sustenta verificar o conjunto anatomia–rig–animação quando as proporções mudam.

4. [Riot Games — Clarity in League, 2021](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/). O artigo oficial prioriza reconhecimento pela silhueta, direção de frente identificável e hierarquia dos efeitos. Aplicação: preservar a arma e o canal do Titã, os braços de hélice do Mímico e a quadrupedia do Orelha. Intensidade crescente não precisa eliminar a leitura do tipo de golpe.

5. [Michael Lyndon / SideFX — Zip! Thwack! Ping! Animation Principles of VFX, GDC 2018](https://media.gdcvault.com/gdc2018/presentations/Lyndon_Michael_ZipThwackPing.pdf). O texto indexado da apresentação conecta antecipação à comunicação de que uma ação está para acontecer. O PDF não pôde ser aberto integralmente. Aplicação limitada: manter uma preparação curta e visível antes do contato. Os efeitos e câmera ficam na integração do agente raiz; o envelope positivo anterior ao windup pede que o VFX de impacto seja condicionado à fase ativa.

## Alternativas consideradas

- Encurtar novamente as durações: alteraria ritmo, defesa e rede sem resolver repetição visual.
- Repetir o mesmo jab com mais rotação: continuaria parecendo um único golpe e aumentaria torções da pele.
- Criar contatos progressivos mantendo os tempos: solução escolhida. As poses mudam, mas o simulador continua decidindo acerto, custo, distância, cancelamento e duração.

## Contrato de integração

- Produção editada somente na região `strikeEnvelope`, `blendCombatPose`, `dogPose` e `humanPose` de `scene.js`.
- `_chainIndex` escolhe a etapa, com fallback para a primeira; nenhum golpe visual concede dano adicional.
- `_attackSerial` identifica a troca de ataque. O blend é apenas visual e vive no rig; não é um estado de combate a serializar.
- `_entryFrom` é fornecido e serializado pelo agente dono do combate. A animação o consome durante a ação, sem inferir um cancelamento legal.
- O blend usa quaternions das articulações e deslocamento limitado da postura. Não modifica comprimento de ossos, escala, posição autoritativa do jogador ou rig da arma.
- `rig.oilGun` e a pose sustentada da rajada de cinco segundos são preservados. O ajuste para alvo baixo não desvia as mãos dessa pose.
- O especial/super do Mímico conserva a hélice; seus chutes mantêm rotação corporal e alternam perna/lado/amplitude.
- A mira baixa vem de ombro, cotovelo, tronco e flexão dos joelhos. Não muda pivôs ou comprimento dos braços.
- As variantes não mudam hitboxes: são diferenciação e progressão visual, não oito novos comandos ou oito valores diferentes de dano.

## Verificação e limites

`node ../work/audit-combo-poses.cjs` executa as funções reais extraídas de produção com os builders reais dos cinco rigs, sem renderizador ou navegador. Na execução após a atualização paralela da geometria do Veterano/Pixel:

- 587 poses exercitadas e 2.752.240 vértices deformados.
- Zero vértices não finitos/fora do limite de auditoria; zero alterações nos comprimentos/escala dos ossos testados.
- Pico igual a 1 exatamente no windup em todos os ataques básicos do elenco.
- Oito assinaturas de contato de soco e quatro de chute em cada personagem.
- Os oito socos humanos dirigem a mão pelo menos 0,342 m abaixo da própria versão normal quando enfrentam Orelha.
- Entradas de corrida e esquiva são distintas do ataque parado; no instante zero, as articulações e a postura coincidem com a ação anterior.
- Pose sustentada do óleo e braços de hélice foram verificados.

`node --check scene.js` passou. Os testes `organic-mesh-tests.cjs`, `roster-combat-tests.cjs` e `game-integration-tests.cjs` passaram: 57/57.

Essas verificações detectam regressões de matemática, continuidade e contrato. Não provam ausência de toda interpenetração visual, apoio perfeito dos pés nem sensação de jogo. A inspeção gráfica de silhuetas, câmera próxima e combos em movimento pertence à validação CUA do agente raiz. Não foi aberta ou alterada a aba em que o usuário está jogando.
