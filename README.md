# NEON CLASH / ASCENSÃO

Jogo de luta em terceira pessoa, feito em HTML, CSS e JavaScript. Controle Azure em duelos contra Crimson, circule livremente pela arena e gire a câmera para acompanhar o combate. Golpes têm alcance, direção, preparação e recuperação: acertar o momento e a distância importa.

## Jogar offline

Abra `index.html` no Chrome ou Edge. No Windows, também pode usar `Abrir jogo.cmd`. Mantenha os arquivos do jogo e a pasta `vendor` juntos. Não precisa de servidor, conta, instalação de dependências nem internet para jogar.

No Linux, use o iniciador na pasta do jogo:

```sh
bash "Abrir jogo.sh"
```

Ele abre uma janela própria do Chrome/Chromium, com perfil separado em `${XDG_CACHE_HOME:-$HOME/.cache}/neon-clash-browser`. Se detectar uma RX 7600, seleciona seu nó gráfico atual e a identidade PCI para o Mesa. Isso evita reutilizar um Chrome que já esteja aberto na GPU integrada. O iniciador não altera configurações globais, drivers nem seu perfil pessoal; o sandbox do navegador continua habilitado. Sem essa placa, usa a seleção padrão do navegador.

É necessário um navegador com JavaScript e WebGL. O áudio é sintetizado localmente e começa após interação. Texturas, cenários, personagens, animações e efeitos são gerados pelo código; o Three.js está incluído na distribuição.

Selecione arena, dificuldade e modo no menu:

- **Duelo:** uma partida em melhor de três, com rounds de 75 segundos. Quem vence dois rounds ganha; empates não concedem vitória.
- **Ascensão:** cinco duelos, com rotação de arenas, dificuldade crescente e uma melhoria escolhida após cada uma das quatro primeiras vitórias. A etapa final exige vencer o Pesadelo. Perder encerra a corrida; o melhor resultado fica salvo localmente.
- **Treino livre:** alvo passivo, tempo ilimitado, regeneração e retorno do adversário após nocaute. Os perigos do Reactor ficam desligados.

A corrida em andamento não é salva ao fechar ou recarregar a página. Ajustes, vitórias acumuladas e recorde de Ascensão ficam no armazenamento do navegador, quando disponível.

## Controles

| Controle | Ação |
| --- | --- |
| W A S D / setas | Mover em relação à câmera |
| Arrastar na arena | Girar a câmera |
| Q / E | Girar a câmera pelo teclado |
| Roda do mouse | Aproximar / afastar |
| C | Recentralizar a câmera |
| Tab / botão de alvo | Alternar acompanhamento do rival e câmera livre |
| J | Soco; encadeie novas entradas após o contato |
| K | Chute, com alcance e desgaste de guarda maiores |
| L | Especial; custa 40 de energia |
| I, segurado | Defender |
| I, perto do impacto | Defesa perfeita: aparar e abrir um contra-ataque |
| Shift | Esquivar na direção do movimento; parado, recuar |
| Espaço | Pular; permite ataques aéreos |
| F, segurado | Correr; consome energia |
| Esc | Pausar / continuar; também libera o mouse capturado |
| R | Reiniciar o duelo atual, inclusive a etapa atual de Ascensão |
| M | Ligar / desligar o som |

**Capturar mouse** ativa o controle contínuo da câmera. Nesse modo, o botão esquerdo soca e o direito chuta. Arrastar e Q/E continuam sendo alternativas quando o navegador não permite a captura. Soltar o mouse capturado pausa a partida.

O acompanhamento do alvo controla a câmera; soltar o alvo permite olhar livremente. Os lutadores continuam orientando o início de seus golpes para o adversário. Depois que um ataque começa, sua direção fica comprometida: circular para fora do cone pode fazê-lo errar.

Em telas de toque, os botões de movimento, ataque, defesa, pulo, esquiva, corrida e alvo aparecem durante a luta. Segure CORRER junto de uma direção para acelerar. Arraste na arena para olhar. A orientação horizontal oferece mais espaço; o comportamento móvel foi verificado em emulação, não em aparelho físico.

## Aprender e dominar

Experimente **J → J → K** depois de cada contato. Existe um buffer curto de uma entrada, e as sequências têm limite; repetir botões não cria uma fila ilimitada de golpes. O adversário ganha uma oportunidade de escape após três impactos seguidos.

Segurar defesa reduz o dano, mas golpes desgastam a guarda. Chutes e especiais podem quebrá-la. Uma defesa perfeita exige pressionar I nos últimos **0,12 segundo** antes do impacto: nega o dano, custa 8 de energia e deixa o atacante vulnerável por 0,42 segundo. A janela tem recarga de 0,6 segundo; manter ou repetir a tecla não a renova continuamente.

Esquivar custa 15 de energia e possui recarga. Correr custa 12 de energia por segundo. A energia se recupera quando você para de correr; administrar distância e reserva permite defender e voltar a atacar. Golpes no vazio precisam terminar a recuperação antes de outra ação.

As dificuldades **Recruta**, **Combatente**, **Lenda** e **Pesadelo** mudam as decisões da IA: reação a golpes visíveis, pressão, espaçamento, defesa, combos e evasão. A CPU conserva a mesma vida, dano, velocidade, alcance e custos em todos os níveis. Os níveis altos punem erros e repetição; o treino ajuda a reconhecer os avisos antes de encará-los.

## Arenas e melhorias

| Arena | Combate |
| --- | --- |
| **Skyline / Chuva Neon** | Terraço de 17 × 17 unidades, chuva e espaço para circular. Sem dano ambiental. |
| **Reactor / Zona Crítica** | Arena de 18 × 18 unidades. Um círculo fixo avisa por 1,7 segundo antes de uma descarga de 1,15 segundo, que causa até um impacto de 15 de dano por lutador em cada ciclo. Saia do círculo; pular protege enquanto estiver no alto, mas aterrissar dentro de uma descarga ativa ainda machuca. |
| **Void / Último Sinal** | Plataforma de 20 × 20 unidades, com maior espaço para controlar aproximações. Sem dano ambiental. |

Após uma vitória intermediária na Ascensão, escolha uma melhoria. Seus efeitos se acumulam e continuam entre rounds e etapas da mesma corrida:

| Melhoria | Efeito por escolha |
| --- | --- |
| **Núcleo de impacto** | +8% de dano nos golpes do jogador |
| **Fluxo de energia** | +15% de regeneração de energia do jogador |
| **Guarda reforçada** | 12% menos desgaste de guarda; a redução é limitada a 50% |

A pontuação considera dano causado, combos, defesas perfeitas, dano recebido e vitória. O rank de cada duelo recompensa precisão e preservação de vida. Reiniciar um duelo abandona seu progresso naquela partida, mantendo as melhorias já conquistadas nas etapas anteriores.

## Imagem, som e acessibilidade

O jogo começa em **LQ** para inicializar com segurança. O botão **HQ/LQ** alterna qualidade. HQ usa iluminação, sombras, bloom, chuva e detalhes adicionais; LQ reduz o trabalho gráfico. O jogo pode mudar automaticamente para LQ quando detecta desempenho baixo, até que você escolha uma qualidade manualmente. Os buffers de bloom são criados apenas em HQ, em formato RGBA8 sem MSAA; as sombras têm 1024 pixels e a resolução física tem teto em ambos os modos. Desempenho depende da GPU, resolução e navegador; não há promessa de taxa de quadros.

Se o navegador perder o contexto WebGL, o jogo para o combate e a renderização, preserva a partida e tenta restaurar o gráfico em LQ. Uma luta recuperada aguarda **VOLTAR À LUTA**. Se o navegador não restaurar o contexto em 12 segundos, surge a opção de reabrir no modo compatível; recarregar abandona a partida atual. Uma restauração tardia ainda permite recuperar a partida antes de recarregar.

Os ajustes incluem sensibilidade, volume geral, trilha e impacto de câmera. A preferência do sistema por movimento reduzido também é respeitada. Há indicadores visuais para preparação de golpes e perigo do Reactor, além dos sinais sonoros. Trocar de aba ou janela pausa a simulação.

A trilha procedural muda por arena e ganha camadas conforme a luta se intensifica. Efeitos usam posicionamento estéreo e compressão dinâmica. O jogo não baixa faixas ou texturas, nem envia telemetria.

## Estrutura

- `index.html` / `style.css`: menu, HUD, ajustes e controles de toque.
- `game.js`: entradas, câmera, interface, transições e armazenamento.
- `combat.js`: simulação determinística, IA, arenas, parry e melhorias.
- `run.js`: regras, pontuação e progressão de Ascensão.
- `DESIGN.md`: pesquisa aplicada, fontes primárias e decisões de design.
- `audio.js`: trilha e efeitos sintetizados com Web Audio.
- `scene.js`: modelos, ambientes, materiais, animação, câmera e efeitos WebGL.
- `vendor/three.min.js`: Three.js r160; licença MIT em `vendor/THREE-LICENSE.txt`.
- `tests/`: verificações automatizadas de combate, progressão e integração.
- `evidencias/v2-*`: relatórios e capturas desta versão. Arquivos de evidência sem o prefixo `v2-` são históricos.

## Desenvolvimento e verificação

Não há compilação para executar o jogo. Com Node.js e npm instalados, as verificações de lógica podem ser executadas com:

```sh
npm test
```

Ou individualmente, sem instalar pacotes:

```sh
node tests/combat-tests.js
node tests/run-tests.cjs
```

A suíte atual contém **28 testes de combate** e **5 de progressão**. Cobre ataques em oito direções, alcance e compromisso, parry, recursos, perigos ambientais, limites das arenas, resets, melhorias, determinismo e partidas simuladas contra repetição de ataques. `tests/combat-tests.html` também executa a suíte de combate no navegador.

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

Para provocar perdas reais de contexto e verificar recuperação, use `npm run test:graphics`. Execute os testes gráficos um de cada vez. A regressão de recuperação passou em 101 verificações no Chrome com SwiftShader. Ela verifica pausa, preservação da Ascensão, reconstrução em LQ, limites de resolução, ausência de loops de animação duplicados e fallback por timeout. Uma perda provocada valida a recuperação do código, sem identificar a causa de um eventual crash de driver.

Resultados desta versão:

- `evidencias/v2-combat-results.json`: resultado da simulação.
- `evidencias/v2-progression-results.txt`: resultado das regras de Ascensão.
- `evidencias/v2-browser-results.json`: contagem, verificações, erros e requisições observados no navegador.
- `evidencias/v2-context-results.json`: regressão de perda e restauração do WebGL.
- `evidencias/v2-linux-gpu-results.json`: diagnóstico da seleção de GPU e limites da validação em hardware.
- `evidencias/v2-*.png`: capturas de menu, arenas e interface móvel emulada.

A integração verifica controles, câmera, pausa, áudio, seleção de mapas, progressão, persistência e layout. Algumas transições usam estados de partida preparados para testar vitória e derrota de forma reproduzível; isso não equivale a cinco duelos vencidos manualmente. Emulação de viewport/toque não substitui QA em dispositivos físicos, e testes de áudio verificam funcionamento e limites técnicos, não uma avaliação auditiva. Ajuste fino de dificuldade e conforto da câmera ainda se beneficiam de sessões com jogadores.
