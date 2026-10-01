# Oil Island (Orelha Edition): arenas e combate

As cinco frentes de pesquisa, suas fontes e os contratos que substituem decisões anteriores estão no [índice de pesquisa aplicada](docs/research/README.md).

## Quatro arenas na versão 4.2

A nova identidade reúne cinco lutadores e quatro cenários. **Oil Island** leva o combate para uma ilha com areia, rochas, palmeiras e mar aberto, numa área de 27 × 27 unidades. **After Hours** usa uma pista de boate de 24 × 24 unidades, cercada por palco, luzes, convidados e mezaninos. **Orla Brava** apresenta uma praia urbana ao entardecer, com areia, calçadão e edifícios costeiros em torno de uma arena de 28 × 28 unidades. **Heliponto** traz uma plataforma de 26 × 26 unidades, cercada por prédios e por dois helicópteros que colidem no céu. Os três cenários anteriores foram retirados da seleção e da simulação.

Os quatro espaços mantêm piso contínuo e decoração sólida fora do campo de combate; os limites coincidem com os da simulação. A seleção funciona em Duelo, Treino, Ascensão e multiplayer. A Ascensão continua com cinco confrontos e percorre o circuito de quatro cenários a partir da escolha inicial. A música local diferencia percussão tropical, pista eletrônica, orla em andamento mais calmo e baixo urbano com textura de rotor no heliponto. Luzes e animações respeitam a opção de movimento reduzido, e a qualidade baixa conserva os elementos que delimitam a arena.

O primeiro round do heliponto tem uma introdução de 6,2 segundos, com um lutador saltando de cada helicóptero antes da colisão. Saltos acontecem entre 1,3 e 3,35 segundos; a colisão ocorre aos 3,8 segundos. São poses visuais conduzidas pelo tempo de fase da partida, sem dano ambiental. A introdução longa não se repete nos demais rounds nem no treino.

Na Orla Brava, cinco jovens genéricos de pele clara carregam tacos de beisebol no fundo do cenário, fora da área útil. Se Orelha estiver em qualquer posição do duelo, o primeiro round fora de treino tem uma introdução de 6,2 s: ele corre até sua posição inicial aos 4,8 s enquanto os perseguidores param no exterior da arena. Dois Orelhas também são contemplados. A câmera retorna ao duelo entre 5,05 e 6,2 s. Posições e câmera são calculadas pelo tempo da fase; a cena não muda vida nem relógio de combate. Movimento reduzido usa câmera estável e menor amplitude nos figurantes.

Os cenários são construídos em módulos separados e integrados ao mesmo renderizador. A mudança de marca preserva identificadores internos, preferências salvas e caminhos do repositório. A validação consolidada desta edição fica em `evidencias/oil-island-validation.json`; capturas visuais e testes de lógica são evidências diferentes.

## Revisão visual pelas referências

Epstein e Raulzito usam superfícies conectadas para tronco, pescoço, braços e mãos, e outra superfície para quadril e pernas. Ombros, tórax, quadril e membros foram ampliados em conjunto para uma silhueta mais robusta; o repouso e a guarda têm tronco ereto e menos assimetria. A deformação por ossos mantém a continuidade durante as poses. As cabeças humanas têm superfícies esculpidas com projeção do atlas facial; rostos e retratos compartilham a mesma arte local, gerada a partir das referências fornecidas. As proporções de cabeça, antebraços e mãos foram revistas em conjunto.

As duas últimas fotos de Orelha orientam porte robusto, pelagem preta e marrom, focinho grisalho, marcas caramelo e orelhas caídas. Corpo, cabeça, patas, orelhas e cauda pertencem a uma superfície conectada e deformada por ossos. A cabeça foi refeita para alongar a ponte do focinho, reduzir o volume arredondado do crânio e dar queda às orelhas. A textura facial volta como cor sobre a própria superfície, com transição para o pelo do corpo; não é um plano solto sobre o rosto. Olhos e nariz mantêm volumes próprios. Essa construção é estilizada e a avaliação de semelhança permanece visual. A arte incorporada não exige requisições externas.

O Oliver Tree conserva o corte tigela liso e alinhado, com óculos alaranjados, jaqueta curta azul-arroxeada e vermelha e jeans azul muito largo, seguindo a última referência fornecida. Seu tema de combate mudou para helicóptero: giros radiais, salto curto, mergulho aéreo e super de três impactos. A animação acompanha a altura física e os tempos da simulação; a rotação não altera a direção comprometida do avanço.

Epstein usa casaco azul-marinho de gola alta, zíper dourado, emblema vermelho e jeans azul. Raulzito tem estampa de joystick sobre roupa gamer. A referência final do Diddy define bucket branco, óculos pretos, camiseta branca ampla com arte vertical azul/ciano, short navy acima do joelho com AS branco, meias e tênis brancos. A estampa é um decalque local derivado da imagem fornecida, aplicado sobre a curva da camiseta. Orelha combina textura de fios curtos, variação de pelagem e a cor facial aplicada à geometria; os detalhes do pelo não substituem a forma anatômica da cabeça.

## Overdrive: elenco e combate ágil

A versão 4 acrescenta cinco personagens aos duelos existentes. A seleção precede a escolha de arena, tem retratos próprios e prévia 3D; as ações de iniciar e treinar ficam fixas para evitar rolagem obrigatória. Nomes provisórios: Epstein, Diddy, Oliver Tree e Raulzito. Orelha conserva o nome e os golpes fornecidos no briefing.

A aparência usa superfícies curvas, volumes afunilados, rostos com cabelo e traços próprios e articulações de animação. Orelha é um quadrúpede, com orelhas, cauda e quatro patas animadas. Recursos são locais e compartilhados; o cache de modelos é limitado aos cinco personagens por posição. O menu mostra um lutador em vez de deixar o rival encobrir sua prévia.

Diddy usa Rajada de Óleo no especial: uma arma com cinco segundos de disparo, 20 projéteis separados por 0,25 s, custo único de 44 de energia e trajetórias resolvidas pela mesma simulação local e online. A emissão sonora é curta e escalonada, sem agendar cinco segundos de nós de áudio de uma vez. A pose sustentada da arma é preservada ao variar os golpes básicos.

O esquema principal é inteiramente de teclado: WASD move; J/K/L atacam; I defende; R usa o super; Shift esquiva; Espaço pula; F sustenta corrida. A câmera começa fixada no rival em toda nova partida, permitindo lutar sem operar o mouse. Z/X giram, C recentraliza e Tab alterna o alvo. Mouse, toque e Q/E são alternativas. Eventos de mouse separados dos eventos de toque permitem pressionar dois botões sem perder ataques nem prender a guarda.

`FightSim.characters` identifica o elenco; `getMove(fighter, action)` reúne os números de cada golpe. O servidor valida a seleção e transporta os personagens nos snapshots e nas revanches. Projéteis têm posições e trajetórias determinísticas; o cliente prevê o comando, mas dano e efeitos de contato vêm do servidor. Os supers custam 100 de energia e têm preparação/interrupção, impedindo que o espetáculo substitua a leitura da luta.

As arenas aumentaram cerca de 25–30% por lado. O maior deslocamento, a corrida e a esquiva permitem fechar distância rapidamente. O teste de qualidade deve cobrir resposta dos controles, leitura de ataques, cinco silhuetas, Orelha no chão/no ar e duas conexões reais com escolhas diferentes. A avaliação visual permanece distinta dos testes de simulação.

Oil Island ganha identidade quando câmera, regras e espetáculo ajudam o jogador a perceber uma abertura, decidir e sentir o resultado. A direção adotada combina **duelos em terceira pessoa, quatro arenas e quatro dificuldades**, com uma campanha curta de cinco confrontos. O desafio aumenta pela qualidade das decisões da CPU, preservando as regras de vida, dano e recursos. A evolução entre confrontos permite construir um estilo próprio, enquanto som, animação e sinais no chão tornam as ameaças reconhecíveis. Esta síntese cruza fontes primárias com inspeção de `combat.js`, `scene.js`, `audio.js`, `run.js` e `game.js`; descreve uma implementação procedural estilizada para navegador, sem equipará-la a uma produção AAA. Recomendações futuras e pontos ainda dependentes de avaliação humana estão identificados abaixo.

## A câmera precisa devolver controle e confiança

Na apresentação sobre God of War, Mihir Sheth relaciona dificuldades dos protótipos à câmera próxima e a ameaças que o jogador não acompanhava; reduzir atrito entre controle, câmera e combate foi parte da evolução do sistema. A implicação para um duelo é direta: o adversário precisa continuar legível enquanto o jogador aprende distância e defesa ([Santa Monica, GDC 2019](https://media.gdcvault.com/gdc2019/presentations/Sheth_Mihir_EvolvingCombat.pdf)).

**Implementado:** câmera atrás do jogador com deslocamento lateral, órbita por mouse ou teclado, aproximação, centralização e acompanhamento do rival ligado em cada partida. O movimento usa o mesmo yaw da câmera exibida. Em alvo fixado, a órbita manual fica limitada a ±1,1 radiano e o enquadramento dos dois corpos continua ativo; depois de 0,9 s sem ajuste, retorna suavemente ao ombro padrão. Câmera livre permite órbita completa. Volumes seletivos do cenário impedem que a posição final atravesse os grandes obstáculos, com entrada imediata na restrição e retorno amortecido da distância. A sensibilidade é ajustável e existe controle por toque. Isso segue a recomendação de permitir ajustes de movimento e sensibilidade, além de desligar tremor ([Microsoft, XAG 117](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117)).

A composição geométrica usa distância, foco e margem de tela. Uma camada adicional de intensidade amplia o campo de visão durante sequências e aplica um acento curto de impacto, sempre entre 52° e 61°. Movimento reduzido desliga variação de campo de visão e rotação de impacto. A câmera não muda a direção, o alcance ou a autoridade dos golpes. As fontes de engenharia e os testes de projeção estão na [pesquisa de câmera](docs/research/research-souls-camera.md); CPU e matrizes não provam conforto visual em uma sessão prolongada.

## O Pesadelo exige decisões melhores, mantendo regras comuns

A Sucker Punch relata que aumentar a vida dos adversários prejudicava a sensação de eficácia da arma; também descreve como defesas excessivas incentivavam passividade. A alternativa discutida envolve agressividade, padrões, defesa e oportunidades de recuperar iniciativa ([PlayStation, Honoring the blade](https://blog.playstation.com/2020/11/25/honoring-the-blade-the-lethality-contract-and-combat-balance-in-ghost-of-tsushima/)). Outra reflexão da equipe liga a precisão do aparo a uma abertura real para contra-atacar ([PlayStation, Mastering the katana](https://blog.playstation.com/2020/06/23/ghost-of-tsushima-mastering-the-katana/)).

**Implementado:** Recruta, Combatente, Lenda e Pesadelo compartilham 300 de vida, dano, alcance e custos básicos; cada round dura 120 s. Mudam latência de reação, pressão, defesa, espaçamento e confirmação de combos. A CPU reage a ataques já iniciados, com espera explícita; não consulta teclas futuras. Ataques fixam a direção no início. O jogador dispõe de esquiva, corrida, salto, quebra de postura e aparo com janela curta, custo e recarga. As quatro arenas preservam a área útil livre e não aplicam dano ambiental. A vida maior foi uma escolha expressa para sustentar sequências longas neste duelo; a referência de Ghost of Tsushima informa diferenças de dificuldade e clareza, não esse valor numérico.

As quatro opções têm descrições concretas, coerentes com a orientação de oferecer vários níveis e evitar nomes depreciativos ([Microsoft, XAG 108](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/108)). Os pesquisadores do projeto reportaram que uma estratégia automatizada de perseguir e repetir socos perdeu muito mais nos níveis altos. Isso demonstra resistência a essa estratégia específica; **a dificuldade percebida e a justiça das janelas ainda exigem testes humanos**. O próximo balanceamento deve observar por que o jogador perdeu e se reconheceu sua chance de resposta.

## Sequências longas com saídas defensivas

O buffer mantém uma única intenção por até 180 ms. Um comando mais recente substitui o anterior, e guarda segurada tem prioridade. A confirmação ofensiva exige contato e começa a partir de `windup + 0,06 s`, com limite de oito ações se o último contato causou dano e três se foi bloqueado. Supers e ataques canalizados não concedem essa continuação ofensiva. Um comando ainda válido pode começar uma nova sequência após a recuperação completa.

Esquiva, salto e guarda podem cancelar a **recuperação**, inclusive de um golpe no vazio. Preparação, fase ativa, hitstun, custo e recarga continuam restringindo o início legal. O óleo do Diddy conserva seu cancelamento após a preparação. Um ataque pode ser preparado nos últimos 180 ms da esquiva e começa depois dela; a entrada de corrida ou esquiva é transportada como `_entryFrom` para a animação. A distinção entre continuação ofensiva confirmada e saída defensiva está detalhada na [pesquisa de defesa e mobilidade](docs/research/research-defense-mobility.md).

A cada impacto do combo, o dano perde dez pontos percentuais, com piso de 40%. A partir do segundo hit, cada nova ação que acerta devolve 3 de energia e 4 de postura uma única vez; acertos básicos também mantêm a devolução de 6 de energia. Esquiva perfeita exige interseção real com ataque ou projétil durante a invulnerabilidade: devolve 10 de energia e 12 de postura uma vez por ataque adversário. O parry custa 8, restaura 18 de postura e usa janela de 0,12 s com recarga de 0,48 s. Energia e postura têm teto de 100.

A proteção após três hits permanece: concede invulnerabilidade temporária e empurrão para permitir escape. Isso é diferente do limite de oito ações; uma sequência permitida não é uma sequência garantida contra quem reage. Ensaios de rotas reais e testes determinísticos estão registrados na pesquisa de defesa, com suas condições e limites.

Uma revisão posterior ampliou o alcance corpo a corpo em 28%; o especial e o super radiais do Oliver Tree receberam 20%. Cone, altura, direção comprometida, defesa e limite de distância continuam determinando o acerto. Os projéteis de óleo e vento mantêm seus percursos próprios. Valores e regressões de fronteira são obtidos de `FightSim.getMove` e `tests/reach-intro-tests.cjs`; os ensaios de dano das pesquisas anteriores pertencem ao alcance daquela etapa.

## Animação progressiva e informação de combo

Os humanos alternam oito contatos de ataque básico: jab, direto, gancho no corpo, uppercut, cruzado, gancho amplo, gancho ascendente e finalização por cima. Há quatro famílias de chute. Orelha também tem oito variações e quatro giros, mantendo patas, ombradas e avanço quadrúpede; Oliver Tree conserva braços de hélice nos especiais. Essas variantes são visuais, sem acrescentar comandos ou dano ao simulador.

A preparação é curta, o pico visual coincide com o início ativo do golpe e a recuperação retorna à guarda. Um blend de 38 ms leva a pose anterior ao próximo ataque sem alterar ossos, escala ou posição autoritativa. Torções básicas do tronco são limitadas a 0,30 rad; a mira baixa vem de articulações e postura. Fontes primárias, comparações e a auditoria de pele estão na [pesquisa de animação](docs/research/research-combo-animation.md).

O HUD mostra a rota J/K/L/R usada, a janela restante do combo, o comando preparado e a oportunidade de continuar. A barra de postura e os avisos de quebra/defesa/esquiva perfeita ajudam a escolher entre manter pressão e recuperar posição. Contagem de combo, sequência de ações e janela defensiva são informações distintas.

## O espetáculo deve explicar quem atingiu quem

A Riot descreve efeitos visuais como comunicação de ação, origem e estado, com contenção suficiente para preservar compreensão. Também relata preservar informações relevantes nos níveis gráficos mais baixos ([Riot, Visual Effects](https://www.riotgames.com/en/artedu/visual-effects); [Riot, Gameplay Clarity](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity)). Essa hierarquia fundamenta uma estética intensa em que o aviso antecede o impacto e o efeito não permanece cobrindo o rival.

**Implementado:** cenários com composições próprias — ilha tropical, boate, praia urbana e heliponto —, texturas geradas localmente, luzes, partículas, rastros e ondas de impacto. Uma trilha sintetizada varia com a arena e com a situação da luta; ataque, acerto, bloqueio e aparo têm sons distintos. Alertas críticos combinam sinais visuais, texto e áudio, seguindo o princípio de não depender somente da cor ou de um canal sensorial ([Microsoft, XAG 103](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103)).

Há qualidade gráfica reduzida, volume, controle de música e redução de movimento. A cena reutiliza recursos e mantém a execução local. Essas medidas favorecem consistência, mas não constituem certificação de acessibilidade nem garantia de desempenho em todo aparelho. **Recomendação:** priorizar testes de legibilidade e tempo de resposta antes de ampliar a quantidade de efeitos.

## A Ascensão transforma repetição em escolha

A Supergiant associa o interesse de Hades à combinação de desafios, aprendizado e novas configurações de habilidades entre tentativas. Seu FAQ também separa a ambição de desafiar de uma dificuldade única para todos ([Supergiant, Hades FAQ](https://www.supergiantgames.com/blog/hades-faq/)). A adaptação original para Oil Island é uma estrutura enxuta, compatível com jogo offline.

**Implementado:** Duelo livre, laboratório de treino e **Ascensão de cinco etapas**, alternando arenas e elevando a dificuldade até o Pesadelo final. Entre vitórias, o jogador escolhe dano adicional, regeneração de energia ou resistência da guarda. A tentativa termina ao perder ou concluir as cinco etapas; a tela apresenta estatísticas e classificação do combate, enquanto o recorde de etapas e pontos fica salvo no navegador. Melhorias valem para a tentativa; mapas e dificuldades permanecem disponíveis desde o início. Há apenas um rival do elenco por luta, sem elenco de chefes ou campanha narrativa extensa.

## O próximo salto depende de observar jogadores

O investimento seguinte deve aprofundar variedade comportamental e ensinar leitura das ameaças. Um novo rival só acrescentará domínio se exigir decisões reconhecíveis; uma nova arena só justificará o custo se alterar posicionamento ou ritmo. A base implementada permite investigar isso em partidas curtas: observar erros, ajustar sinais e janelas, e repetir o teste. Esse processo dará evidência para calibrar a experiência entre acessível, exigente e verdadeiramente dominável.
