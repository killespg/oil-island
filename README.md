# OIL ISLAND / ORELHA EDITION

Jogo de luta em terceira pessoa, feito em HTML, CSS e JavaScript, com servidor multiplayer TypeScript/Node.js. Escolha entre cinco personagens e quatro arenas e combine golpes rápidos, esquivas, defesa perfeita e especiais próprios. A versão 4.2 reúne uma ilha tropical, uma festa de boate noturna, uma praia urbana e um heliponto elevado, cada um com seu espaço de combate, iluminação e trilha sintetizada.

Epstein e Raulzito têm ombros, tórax e membros mais robustos, postura ereta e superfícies conectadas para tronco e braços e para quadril e pernas, deformadas por ossos. Epstein veste jeans azul. Orelha tem uma superfície contínua para corpo, cabeça, patas, orelhas e cauda; a textura facial é aplicada à própria superfície da cabeça, com transição para a pelagem. As referências orientam o modelo estilizado, sem promessa de reprodução fotográfica.

## Elenco / versão 4.2

| Personagem | Estilo | Especial / energia | Super / 100 energia |
| --- | --- | --- | --- |
| Epstein | Grisalho, ombros largos, casaco azul-marinho de gola alta, zíper dourado, emblema vermelho e jeans azul | Impacto Vetorial / 40 | Última Linha |
| Diddy | Bucket branco, óculos escuros, camiseta ampla estampada, short navy acima do joelho, meias e tênis brancos | Rajada de Óleo / 44 | Queda do Colosso |
| Oliver Tree | Corte tigela alinhado, óculos alaranjados, jaqueta azul-arroxeada/vermelha e jeans muito largo | Hélice Giratória / 36 | Decolagem Total |
| Orelha | Vira-lata de pelagem escura mesclada, focinho longo e orelhas caídas | Brisa da Brava / 30 | Maré da Proteção |
| Raulzito | Cabelo azul preso no alto, óculos, barba rosa e camiseta com joystick | Salto de Quadro / 32 | Overclock |

O menu mostra a prévia 3D do personagem escolhido, com botões de rotação em telas maiores, e permite selecionar o rival no solo/treino. A escolha fica salva no navegador e segue para o servidor ao criar ou entrar numa sala. Cada jogador pode escolher o mesmo personagem; a identificação de jogador e o HUD permanecem independentes.

Orelha tem **Brisa da Brava** como projétil curto de vento e areia; **Giro da Orla** no chute; **Salto do Casamento** ao chutar no ar; **Esquiva do Mascote** em rolagem; e **Maré da Proteção**, três impactos que empurram o rival para o centro, com mudança temporária do ambiente para o entardecer litorâneo. Epstein, Diddy, Oliver Tree e Raulzito são nomes provisórios para as descrições visuais fornecidas.

Diddy usa **Rajada de Óleo** (L; E também funciona) para disparar uma arma durante cinco segundos, ao custo único de 44 de energia. A rajada completa emite 20 projéteis, com intervalo de 0,25 s; eles seguem a direção comprometida do ataque. Guarda, esquiva ou um impacto recebido podem interromper a rajada conforme a janela legal da ação.

Oliver Tree usa **Chute Rotor** (K; Q também funciona) com uma pequena decolagem, **Pouso de Impacto** (K no ar) com descida acelerada, **Hélice Giratória** (L; E também funciona) com dois impactos em 360° e **Decolagem Total** (R) com três impactos e salto curto. Braços em hélice e pulsos sonoros acompanham os movimentos. Os saltos são calculados pela simulação; não concedem invulnerabilidade automática.

O deslocamento base é de 6,4 unidades/s e a corrida, 10,5, com modificadores por personagem. A esquiva dura 0,28 s e protege por 0,16 s, com custo e recarga. Ataques confirmados permitem continuar a sequência; esquiva, salto ou guarda podem interromper a recuperação de um golpe, inclusive quando ele errou. A preparação e a fase ativa continuam comprometidas.

O alcance corpo a corpo foi ampliado para facilitar contato e continuidade sem exigir colisão entre os modelos. O limite continua real: sair do alcance, da altura ou da direção comprometida faz o golpe errar. Óleo do Diddy e vento de Orelha conservam seus próprios percursos de projétil.

A versão 3 adiciona duelos privados **1×1 no navegador**, com servidor em TypeScript/Node.js. O servidor calcula o combate a 60 Hz e envia estados a 20 Hz. O cliente prevê os comandos locais, reconcilia com o servidor e interpola o adversário. A renderização acompanha a taxa da tela, com interpolação também no solo e resolução automática para manter os efeitos quando possível. Isso reduz saltos entre atualizações; não elimina o atraso da internet nem garante 60 FPS em todo aparelho.

## Jogar online

Na máquina que hospedará a partida, instale Node.js 24 LTS, abra a pasta do repositório e execute:

```sh
npm ci
npm start
```

Abra `http://localhost:3000` no navegador. Escolha seu personagem e, na seção **DUELO ONLINE**, crie uma sala e compartilhe o convite ou código de seis caracteres. O segundo jogador escolhe seu personagem, acessa o mesmo servidor, informa o código e entra. A arena é escolhida por quem cria a sala; cada jogador tem sua própria câmera e HUD. A seleção é preservada na revanche, que exige a confirmação dos dois.

Em dois PCs na mesma rede, ambos devem abrir `http://IP-DO-SERVIDOR:3000` — `localhost` sempre aponta para o próprio computador. Permita a porta TCP 3000 no firewall da máquina servidora, se necessário. O servidor continua rodando no terminal até ser encerrado.

Para jogar pela internet, hospede este servidor em um serviço que mantenha processos Node e conexões WebSocket, com HTTPS. **GitHub Pages sozinho não executa o servidor.** Os arquivos de produção e instruções estão em [ONLINE.md](ONLINE.md); nenhum serviço pago ou domínio foi provisionado automaticamente.

O menu de pausa online solta os comandos, mas a partida continua. Sair ou perder a conexão encerra a sala para os dois jogadores. Não há reconexão automática, contas, ranking global ou fila pública nesta versão. Os modos contra a CPU e Ascensão continuam offline.

## Jogar offline

Abra `index.html` no Chrome ou Edge. No Windows, também pode usar `Abrir jogo.cmd`. Mantenha os arquivos do jogo, incluindo os quatro módulos `arena-*.js`, e as pastas `assets` e `vendor` juntos. Não precisa de servidor, conta, instalação de dependências nem internet para jogar.

No Linux, use o iniciador na pasta do jogo:

```sh
bash "Abrir jogo.sh"
```

Ele abre uma janela própria do Chrome/Chromium, com perfil separado em `${XDG_CACHE_HOME:-$HOME/.cache}/neon-clash-browser`. Se detectar uma RX 7600, seleciona seu nó gráfico atual e a identidade PCI para o Mesa. Isso evita reutilizar um Chrome que já esteja aberto na GPU integrada. O iniciador não altera configurações globais, drivers nem seu perfil pessoal; o sandbox do navegador continua habilitado. Sem essa placa, usa a seleção padrão do navegador.

É necessário um navegador com JavaScript e WebGL. O áudio é sintetizado localmente e começa após interação. Modelos, cenários, animações e efeitos são construídos no código. A pasta `assets` inclui os rostos humanos, a estampa do Diddy, o retrato e a textura facial de Orelha e as texturas de tecido, jeans e pelos, também compatíveis com execução offline; o Three.js está incluído na distribuição.

Selecione arena, dificuldade e modo no menu:

- **Duelo:** uma partida em melhor de três, com 300 de vida por lutador e rounds de 120 segundos. Quem vence dois rounds ganha; empates não concedem vitória.
- **Ascensão:** cinco duelos, com rotação de arenas, dificuldade crescente e uma melhoria escolhida após cada uma das quatro primeiras vitórias. A etapa final exige vencer o Pesadelo. Perder encerra a corrida; o melhor resultado fica salvo localmente.
- **Treino livre:** alvo passivo, tempo ilimitado, regeneração e retorno do adversário após nocaute. As entradas cinematográficas longas são omitidas no treino.

A corrida em andamento não é salva ao fechar ou recarregar a página. Ajustes, vitórias acumuladas e recorde de Ascensão ficam no armazenamento do navegador, quando disponível.

## Controles

A câmera começa acompanhando o rival automaticamente em cada partida. **WASD + J/K/L/I** formam o esquema principal e permitem jogar só no teclado; mouse, toque e atalhos Q/E são alternativas.

| Controle | Ação |
| --- | --- |
| W A S D / setas | Mover em relação à câmera |
| Arrastar com botão do meio / arrastar no toque | Girar a câmera |
| Z / X | Girar a câmera pelo teclado |
| Roda do mouse | Aproximar / afastar |
| C | Recentralizar a câmera |
| Tab / clique no botão do meio / botão de alvo | Alternar acompanhamento do rival e câmera livre |
| J / clique esquerdo | Golpe rápido; encadeie novas entradas após o contato |
| K / Q | Chute; Orelha faz rasteira ou cabeçada no ar |
| L / E | Especial; custo indicado na seleção do personagem |
| I / botão direito, segurado | Defender |
| I / botão direito, perto do impacto | Defesa perfeita: aparar e abrir um contra-ataque |
| Shift | Esquivar na direção do movimento; em neutro os humanos recuam e Orelha rola para frente |
| Espaço | Pular; permite ataques aéreos |
| F, segurado | Correr; consome energia |
| Esc | Pausar / continuar; também libera o mouse capturado |
| R | Super; custa 100 de energia |
| M | Ligar / desligar o som |

**Capturar mouse** é opcional e ativa o controle contínuo da câmera. O botão esquerdo ataca e o direito defende, com ou sem captura. Clique no botão do meio para alternar o alvo; arraste com ele para girar a câmera sem captura, inclusive enquanto segura a defesa. Z/X também giram a câmera; no toque, arraste na arena. Soltar o mouse capturado pausa a partida. Para reiniciar o solo, use **Esc → Recomeçar partida**; R é reservado ao super.

O acompanhamento do alvo mantém os dois lutadores enquadrados e permite pequenos ajustes manuais; soltar o alvo permite órbita livre de 360°. A câmera evita volumes grandes do cenário e seu eixo acompanha o movimento relativo a ela. Os lutadores continuam orientando o início de seus golpes para o adversário. Depois que um ataque começa, sua direção fica comprometida: circular para fora do cone pode fazê-lo errar.

Em telas de toque, os botões de movimento, ataque, defesa, pulo, esquiva, corrida e alvo aparecem durante a luta. Segure CORRER junto de uma direção para acelerar. Arraste na arena para olhar. A orientação horizontal oferece mais espaço; o comportamento móvel foi verificado em emulação, não em aparelho físico.

## Aprender e dominar

Experimente **J → J → K → L** e varie o ritmo e a distância. O buffer conserva uma única intenção por até **180 ms**; o comando mais recente substitui o anterior. Um contato confirmado abre continuação a partir de 60 ms depois do início da fase ativa. É possível encadear até **oito ações quando o contato causa dano** e até **três contra guarda**. O adversário continua ganhando uma oportunidade de escape após três impactos seguidos: oito ações possíveis não significam oito acertos garantidos.

O HUD mostra os golpes usados, o tempo restante da janela de combo e quando há uma continuação ou comando preparado. Cada personagem tem oito variações de contato do ataque básico e quatro famílias de chute. As poses progridem, mas o comando e a regra de dano continuam os mesmos. O primeiro ataque depois de corrida ou esquiva preserva essa entrada na animação; um ataque solicitado nos últimos 180 ms da esquiva começa apenas depois de ela terminar.

Segurar defesa reduz o dano, mas golpes desgastam a postura, mostrada numa barra própria. Chutes e especiais podem quebrá-la. Uma defesa perfeita exige pressionar I nos últimos **0,12 segundo** antes do impacto: nega o dano, custa 8 de energia, recupera 18 de postura e deixa o atacante vulnerável por 0,42 segundo. A janela tem recarga de 0,48 segundo; manter ou repetir a tecla não a renova continuamente.

Esquivar custa 15 de energia e possui recarga de 0,58 s, contada do início. Correr custa 12 de energia por segundo. A energia se recupera quando você para de correr: 9/s normalmente, 3,5/s defendendo e 22/s no treino, antes das melhorias da Ascensão. É possível preparar esquiva ou salto até 180 ms antes da retomada legal; o recurso só é pago quando a ação começa. Guarda segurada tem prioridade sobre o comando pendente.

Acertos básicos devolvem 6 de energia. A partir do segundo impacto de um combo, uma nova ação que acerta devolve mais 3 de energia e 4 de postura, uma vez por ação. Uma esquiva perfeita, realmente atravessando um golpe ativo ou projétil, devolve 10 de energia e 12 de postura, uma vez por ataque adversário. Os medidores respeitam o máximo de 100; esquivar longe não gera recompensa. O dano de combo diminui 10 pontos percentuais por impacto até o piso de 40%, ajudando a sustentar duelos mais longos.

As dificuldades **Recruta**, **Combatente**, **Lenda** e **Pesadelo** mudam as decisões da IA: reação a golpes visíveis, pressão, espaçamento, defesa, combos e evasão. A CPU conserva a mesma vida, dano, velocidade, alcance e custos em todos os níveis. Os níveis altos punem erros e repetição; o treino ajuda a reconhecer os avisos antes de encará-los.

## Arenas e melhorias

| Arena | Combate |
| --- | --- |
| **Oil Island / Ilha** | Arena tropical de 27 × 27 unidades, entre rochas, palmeiras e mar aberto. Sem dano ambiental. |
| **After Hours / Boate** | Pista de 24 × 24 unidades, cercada por palco, luzes, mezaninos e convidados. Sem dano ambiental. |
| **Orla Brava / Praia** | Arena de areia de 28 × 28 unidades, junto ao calçadão e à cidade litorânea ao entardecer. Cinco jovens genéricos de pele clara com tacos de beisebol ficam ao fundo, fora da área de luta. Sem dano ambiental. |
| **Heliponto / Colisão no Céu** | Plataforma elevada de 26 × 26 unidades, com dois helicópteros no cenário e entrada cinematográfica. A colisão não causa dano aos lutadores. |

As quatro arenas mantêm a área de combate livre de mobiliário e decoração sólida. A seleção vale para Duelo, Treino, Ascensão e salas online; na Ascensão, cinco duelos percorrem o circuito de quatro arenas a partir da arena escolhida. Cada cenário tem seu próprio acompanhamento musical: percussão tropical na ilha, batida eletrônica na boate, andamento mais calmo na orla e baixo urbano com pulsos de rotor no heliponto.

No primeiro round do heliponto, uma introdução de 6,2 segundos mostra cada lutador saltando de um helicóptero antes de os dois veículos colidirem. O combate começa depois da chegada à plataforma. A sequência acompanha o relógio da partida, inclusive online, e não se repete nos rounds seguintes. No treino, a entrada permanece curta.

Na Orla Brava, a introdução de 6,2 segundos mostra Orelha chegando à arena enquanto os cinco jovens correm atrás e param fora do campo de combate. Ela aparece somente no primeiro round fora do treino, quando Orelha ocupa qualquer um dos dois lados, inclusive se os dois jogadores o escolherem. A cena não causa dano nem consome os 120 segundos da luta; movimento reduzido mantém a câmera estável.

Após uma vitória intermediária na Ascensão, escolha uma melhoria. Seus efeitos se acumulam e continuam entre rounds e etapas da mesma corrida:

| Melhoria | Efeito por escolha |
| --- | --- |
| **Núcleo de impacto** | +8% de dano nos golpes do jogador |
| **Fluxo de energia** | +15% de regeneração de energia do jogador |
| **Guarda reforçada** | 12% menos desgaste de guarda; a redução é limitada a 50% |

A pontuação considera dano causado, combos, defesas perfeitas, dano recebido e vitória. O rank de cada duelo recompensa precisão e preservação de vida. Reiniciar um duelo abandona seu progresso naquela partida, mantendo as melhorias já conquistadas nas etapas anteriores.

## Imagem, som e acessibilidade

O botão de qualidade alterna **AUTO → HQ → LQ**. AUTO começa em LQ; após três janelas estáveis de dois segundos, experimenta HQ. Se a taxa cair, reduz a resolução do 3D antes de retirar iluminação, sombras e bloom; a interface permanece nítida. Se o desempenho continuar muito baixo, volta a LQ e não repete a promoção durante aquela sessão automática. HQ/LQ permitem escolha manual. Os buffers de bloom são criados apenas em HQ, em formato RGBA8 sem MSAA; as sombras têm 1024 pixels e a resolução física tem teto em ambos os modos.

Se o navegador perder o contexto WebGL, o solo para o combate e tenta restaurar o gráfico em LQ. Uma luta recuperada aguarda **VOLTAR À LUTA**. No online, os comandos são soltos imediatamente e a partida continua no servidor; o cliente recebe o estado atual ao recuperar o gráfico. A recuperação mantém LQ até você trocar a qualidade manualmente. Se o navegador não restaurar o contexto em 12 segundos, surge a opção de recarregar, o que abandona a partida atual.

Os ajustes incluem sensibilidade, volume geral, trilha e impacto de câmera. Durante combos, a câmera amplia gradualmente o enquadramento e dá um acento curto no contato; o campo de visão fica limitado a 52–61°. Movimento reduzido desliga essa variação e a rotação de impacto; a preferência do sistema também é respeitada. Há indicadores visuais para preparação de golpes, além dos sinais sonoros. Trocar de aba ou janela pausa o solo; online, abre o menu e solta seus comandos.

A trilha procedural muda por arena e ganha camadas conforme a luta se intensifica. Efeitos usam posicionamento estéreo e compressão dinâmica. O jogo não baixa faixas ou texturas, nem envia telemetria.

## Estrutura

- `index.html` / `style.css`: menu, HUD, ajustes e controles de toque.
- `game.js`: entradas, câmera, interface, transições e armazenamento.
- `combat.js`: simulação determinística, IA, arenas, parry e melhorias.
- `run.js`: regras, pontuação e progressão de Ascensão.
- `DESIGN.md`: pesquisa aplicada, fontes primárias e decisões de design.
- `docs/research/README.md`: índice das cinco pesquisas de combate, câmera, controles, defesa e animação, com contratos atuais e limites de evidência.
- `audio.js`: trilha e efeitos sintetizados com Web Audio.
- `scene.js`: modelos, ambientes, materiais, animação, câmera e efeitos WebGL.
- `arena-island.js` / `arena-nightclub.js` / `arena-seaside.js` / `arena-helipad.js`: construção e animação dos quatro cenários.
- `organic-mesh.js`: superfícies conectadas com normais suaves e pesos de deformação.
- `fighters-human.js` / `fighters-dog.js`: corpos e articulações dos personagens.
- `fighter-faces.js` / `assets/faces-v5.js`: cabeças 3D e atlas local dos retratos/rostos.
- `assets/orelha-face.js`: textura facial local aplicada à superfície do cachorro.
- `network.js`: salas, previsão local, reconciliação, suavização e desconexão.
- `performance.js`: interpolação visual e política de qualidade automática.
- `server/`: servidor autoritativo TypeScript, protocolo validado e entrega dos arquivos.
- `ONLINE.md` / `Dockerfile`: execução e hospedagem do multiplayer.
- `vendor/three.min.js`: Three.js r160; licença MIT em `vendor/THREE-LICENSE.txt`.
- `tests/`: verificações automatizadas de combate, progressão e integração.
- `evidencias/oil-island-validation.json`: relatório consolidado da versão 4.2. Relatórios `v2-*`, `v3-*`, `v4-*` e `v5-*` são históricos.

## Desenvolvimento e verificação

Para verificar a versão online sem abrir navegador:

```sh
npm ci
npm test
npm run test:online
```

As verificações da versão 4.2 cobrem combate, personagens, progressão pelas quatro arenas, serialização/previsão/rede, interpolação/qualidade, interface, superfícies conectadas, áudio e servidor HTTP/WebSocket. Os testes com dois clientes reais em localhost também verificam as quatro arenas na criação da sala, nos snapshots e na previsão. A contagem e os resultados consolidados estão em `evidencias/oil-island-validation.json`.

Os testes da interface em VM usam DOM e renderizador simulados. Testes de geometria verificam continuidade, fechamento e pesos de deformação; eles não avaliam semelhança visual. A revisão no navegador e suas capturas são registradas separadamente no relatório. Isso não equivale a validação em celular físico ou partida pela internet.

Cinco frentes de otimização reduziram buffers de geometria, agruparam peças rígidas dos cenários, compartilharam texturas dos personagens e removeram trabalho de câmera/animação desnecessário. A qualidade LQ também adapta a resolução até 65%; AUTO só tenta subir a qualidade durante combate estável. As preferências AUTO/HQ/LQ ficam salvas. HQ manual continua sendo uma escolha explícita de qualidade máxima.

A auditoria de memória/geometria e as amostras curtas no navegador estão em [docs/performance.md](docs/performance.md). Foram medidas nesta RX 7600, não em uma GPU fraca. Não há garantia de FPS para outros dispositivos. O contador opcional em **Ajustes → Mostrar FPS** permite conferir o desempenho no aparelho; os relatórios antigos continuam identificados como históricos.

Não há compilação para executar o jogo. Com Node.js e npm instalados, as verificações de lógica podem ser executadas com:

```sh
npm test
```

Ou individualmente, sem instalar pacotes:

```sh
node tests/combat-tests.js
node tests/run-tests.cjs
```

A suíte cobre ataques em oito direções, alcance e compromisso, parry, recursos, ausência de dano ambiental, limites das quatro arenas, resets, melhorias, determinismo e partidas simuladas contra repetição de ataques. `tests/combat-tests.html` também executa a suíte de combate no navegador.

Para a integração automatizada com Playwright, instale as dependências de desenvolvimento e um Chromium de teste:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Esses downloads são necessários apenas para preparar o ambiente de testes. O teste abre o jogo via `file://` com o contexto de navegador offline.

Para usar um Chrome já instalado, informe seu executável por `CHROME_PATH`. Em Linux, por exemplo:

```sh
CHROME_PATH=/usr/bin/google-chrome npm run test:browser
```

No PowerShell:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
```

`PLAYWRIGHT_MODULE` pode apontar para uma instalação de Playwright fora de `node_modules`, quando o ambiente já fornece essa dependência. O script é `tests/browser-v2.cjs`; o antigo `tests/browser_check.py` pertence à versão anterior.

Para provocar perdas reais de contexto e verificar recuperação, use `npm run test:graphics`. Execute os testes gráficos um de cada vez. Na versão 2, a regressão de recuperação passou em 101 verificações no Chrome com SwiftShader; esse resultado é histórico e não valida a versão 4.2. Verifica pausa, preservação da Ascensão, reconstrução em LQ, limites de resolução, ausência de loops de animação duplicados e fallback por timeout. Uma perda provocada valida a recuperação do código, sem identificar a causa de um eventual crash de driver.

Resultados históricos da versão 2:

- `evidencias/v2-combat-results.json`: resultado da simulação.
- `evidencias/v2-progression-results.txt`: resultado das regras de Ascensão.
- `evidencias/v2-browser-results.json`: contagem, verificações, erros e requisições observados no navegador.
- `evidencias/v2-context-results.json`: regressão de perda e restauração do WebGL.
- `evidencias/v2-linux-gpu-results.json`: diagnóstico da seleção de GPU e limites da validação em hardware.
- `evidencias/v2-*.png`: capturas de menu, arenas e interface móvel emulada.

A integração verifica controles, câmera, pausa, áudio, seleção de mapas, progressão, persistência e layout. Algumas transições usam estados de partida preparados para testar vitória e derrota de forma reproduzível; isso não equivale a cinco duelos vencidos manualmente. Emulação de viewport/toque não substitui QA em dispositivos físicos, e testes de áudio verificam funcionamento e limites técnicos, não uma avaliação auditiva. Ajuste fino de dificuldade e conforto da câmera ainda se beneficiam de sessões com jogadores.
