# Oil Island — pesquisa e implementação de controles ágeis

> Registro da etapa de input em 2026-10-01. Na integração final, WASD + J/K/L/I são o esquema principal, o alvo começa fixado em cada partida e mouse, toque e Q/E permanecem opcionais. As menções a browser/Playwright abaixo são evidência histórica dessa etapa, com os limites registrados pelo autor; não são uma nova execução nem substituem a validação CUA final. Consulte o [índice atual](README.md) e o [relatório integrado](../../evidencias/oil-island-validation.json).

Data: 2026-10-01. Escopo: entrada em `game.js`, instruções em `index.html`/`README.md` e regressões em `tests/game-integration-tests.cjs`. Contrato da câmera preservado: `rotateCamera(dx,dy)`, `zoomCamera(delta)`, `cameraInput(x,z)`, `cameraInfo()`, `setLockOn(bool)` e `resetCamera(state)`.

## Pesquisa primária e decisões

1. **Botões simultâneos precisam de bordas independentes.** No mouse, `pointerdown` só ocorre ao passar de nenhum botão para algum botão; apertar um segundo botão emite `mousedown`, mas não outro `pointerdown`. A saída é simétrica: `pointerup` só ocorre quando o último botão é solto. O código anterior já havia separado ataque/guarda, mas o arraste do meio ainda dependia dessas bordas incompletas. A correção usa `mousedown`/`mouseup` para cada botão e `mousemove` para a câmera do mouse. Fontes: [MDN pointerdown](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerdown_event), [MDN pointerup](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerup_event).

2. **Estado atual complementa as bordas.** `buttons` é uma máscara dos botões ativos: direito é 2, meio é 4 e ambos são 6. Ao voltar à área da página, um movimento sem o botão segurado limpa uma eventual guarda/arraste antigo. Isso evita depender de um `mouseup` recebido fora da janela. Fonte: [MDN MouseEvent.buttons](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons).

3. **Captura do cursor e captura de contato têm papéis distintos.** Pointer Lock fornece deslocamento relativo `movementX/movementY`, sem limite nas bordas da tela. Pointer Capture mantém o destino de eventos de um contato específico, adequado ao dedo arrastando a arena ou segurando um botão. Mantidos ambos os caminhos, com cancelamento ao pausar/perder foco. Fontes: [MDN Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API), [MDN setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).

4. **Toque não deve gerar ataque duplicado nem soltar outra entrada.** A especificação permite eventos de mouse de compatibilidade após toque; cancelar `pointerdown` suprime parte desse fluxo. O arraste touch segue cancelando o evento e cada botão agora guarda um conjunto de `pointerId`, em vez de um único booleano. Quando `sourceCapabilities.firesTouchEvents` existe, o caminho de mouse ignora esses eventos sintéticos. Fonte: [W3C Pointer Events, compatibility mapping](https://www.w3.org/TR/pointerevents/#compatibility-mapping-with-mouse-events).

5. **Mouse e tela de toque podem coexistir.** `maxTouchPoints` informa capacidade de toque, não ausência de mouse. `any-pointer:fine` identifica a existência de um dispositivo preciso. O Chrome desta máquina mostrou `maxTouchPoints=10`, `pointer:coarse=false`, `any-pointer:fine=true`; mesmo assim, a versão anterior escondia Capturar Mouse. Agora o botão e a API permanecem disponíveis nesses híbridos, junto dos botões touch. Fonte: [MDN any-pointer](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/any-pointer).

6. **Lock-on explícito e câmera livre são complementares.** O manual oficial de Elden Ring separa mover câmera, alternar alvo e resetar câmera; seu marcador indica o alvo selecionado. A aplicação ao duelo de Oil Island é uma inferência de design, não cópia das teclas do jogo: Tab e clique do meio alternam alvo, arrastar o meio olha, C recentraliza. Um limiar espacial de 5 px distingue clique de arraste sem temporizador. Com mouse capturado, o clique do meio alterna já na pressão, pois o olhar contínuo não precisa desse arraste. Fonte: [Bandai Namco — Elden Ring Starter Guide](https://en.bandainamcoent.eu/elden-ring/news/elden-ring-starter-guide-tips-know-playing-the-game).

7. **Entrada rápida não se resume a diminuir animações.** O atraso começa entre a interação e a execução do callback e cresce com trabalho na thread principal. Preservados ataques no evento de pressão, direção de esquiva amostrada na hora da ação e atualizações leves da câmera. Não foram acrescentados debounce, fila de ações nem nova espera temporal. A documentação consultada não fornece uma meta de milissegundos específica para este jogo, e nenhuma latência física foi medida nesta etapa. Fonte: [web.dev — Optimize input delay](https://web.dev/articles/optimize-input-delay).

## Resultado aplicado

- Meio pode começar a olhar com direito já pressionado, e soltar meio encerra o olhar mesmo com direito ainda segurado.
- Clique do meio alterna alvo sem disparar ataque; arraste não alterna alvo. Tab, Z/X, C, Q/E/R, Shift, J/K/L/I e controles touch existentes permanecem compatíveis.
- Defesa touch não se perde ao levantar apenas um de dois dedos; `lostpointercapture` antigo após uma pausa não cancela um contato novo.
- Captura de mouse funciona como opção em hardware híbrido e seu texto prioriza o estado efetivamente capturado.
- Instruções do menu, HUD e README descrevem clique/arraste do meio; a contagem antiga de 6 arenas no menu foi corrigida para 4.
- Nenhuma mudança nesta etapa em `combat.js`, regras de dano/energia, óleo do Titã, intro do heliponto, eventos de som ou renderer.

## Verificação e limites

- Novas regressões escritas e observadas falhando antes da implementação. Depois: `node --test tests/game-integration-tests.cjs` — 26/26 passaram na integração CPU, com o código real de entrada/combate e DOM/renderer de teste.
- `node --check game.js` sem erro de sintaxe.
- Chrome real, via Playwright: clique do meio soltou alvo; direito sustentou guarda; arraste meio+direito girou câmera livre; soltar meio parou a rotação mantendo guarda; arraste não trocou lock; direito soltou guarda; novo clique do meio fixou alvo. Esses passos chegaram até a tentativa de captura, que revelou o bug híbrido acima.
- A detecção híbrida foi corrigida e coberta por teste CPU. A tentativa seguinte de Chrome perdeu progresso antes da guarda (timeout, provavelmente disputa de foco com QA paralelo); a captura real após a correção ainda precisa ser confirmada na rodada integral do coordenador.
- O script temporário de navegador está em `C:/Users/kille/AppData/Local/Temp/playwright-test-oil-controls.cjs`; seu `finally` fecha o navegador, inclusive em timeout.
- Não houve medição de latência física, teste em celular físico ou validação em Safari/Firefox. A inspeção visual integral permanece com o coordenador. Mouse conectado após a página já ter carregado ainda exige recarregar para atualizar a detecção de capacidade.
