# NEON CLASH

Jogo de luta 3D em HTML, CSS e JavaScript. Você controla Azure contra Crimson em um terraço futurista. A partida termina quando um lutador vence dois rounds.

## Jogar

Abra **index.html** no Chrome ou Edge, ou dê dois cliques em **Abrir jogo.cmd**. Não precisa instalar nada, executar servidor ou conectar à internet. Mantenha os arquivos e a pasta `vendor` juntos.

Escolha a dificuldade e clique em **Entrar no ringue**. **Aquecer no modo treino** oferece um adversário passivo que recupera a vida para praticar golpes.

| Tecla | Ação |
| --- | --- |
| W A S D / setas | Mover pela arena, incluindo profundidade |
| J | Soco; pressione novamente no ritmo para encadear |
| K | Chute |
| L | Especial; custa 40 de energia |
| I, segurado | Defender |
| Shift | Esquivar na direção do movimento; parado, recua |
| Espaço | Pular; permite ataques no ar |
| Esc | Pausar / continuar |
| R | Recomeçar a partida |
| M | Ligar / desligar áudio |

**Dicas:** aproxime-se e alinhe a profundidade dos lutadores antes de atacar. Experimente **J → J → K**. O chute alcança mais longe que o soco. A defesa reduz o dano, mas golpes sucessivos quebram a guarda. A energia se recupera; não desperdice especiais fora de alcance.

Em telas de toque, os botões aparecem durante a luta; a orientação horizontal oferece mais espaço. O botão **HQ/LQ** alterna qualidade gráfica. O jogo reduz a qualidade automaticamente quando detecta baixo desempenho, e pausa ao trocar de janela ou aba. O som sintetizado começa após uma interação. Vitórias ficam salvas apenas no navegador local, quando o armazenamento estiver disponível.

## Arquivos

- `index.html` e `style.css`: interface responsiva e controles.
- `game.js`: entrada, interface, áudio sintetizado e ciclo do jogo.
- `combat.js`: simulação de combate e inteligência do rival.
- `scene.js`: cenário, personagens, animações e efeitos 3D procedurais.
- `vendor/three.min.js`: Three.js r160, distribuído sob licença MIT em `vendor/THREE-LICENSE.txt`.
- `tests/`: verificações de simulação e integração no navegador.
- `evidencias/`: capturas reais e resultados das verificações.
- `manifesto.json`: tamanhos e hashes SHA-256 dos arquivos entregues.

Todos os recursos visuais são gerados pelo código. Não há cadastro, telemetria, chamadas HTTP ou serviços externos durante o jogo. Requer JavaScript e WebGL; desempenho depende da placa gráfica e do navegador. O áudio pode ser desligado pelo botão no canto superior.

## Verificação

Abra `tests/combat-tests.html` para executar os testes determinísticos do combate no navegador.

O teste de integração usa Python, Playwright e uma instalação local do Chrome ou Edge:

```powershell
python tests/browser_check.py
```

Nesta máquina, as ferramentas de teste estão em `.tools/python`. Em outra máquina, instale-as com `python -m pip install --target .tools/python playwright`. Essas ferramentas não são necessárias para jogar.

Os relatórios em `evidencias/combat-results.json` e `evidencias/browser-results.json` registram as verificações efetivamente executadas. Testes móveis usam emulação de viewport e toque no Chromium; não equivalem a um teste em aparelho físico.

Validação local em 30/09/2026: **16 testes de combate** e **28 verificações de integração** aprovados, sem erros JavaScript e sem requisições HTTP. A integração também executa a suíte de combate; os números não representam uma soma de testes independentes.

Na NVIDIA GeForce G210 desta máquina, o jogo completo em modo leve mediu **58,98 FPS** em uma amostra de aproximadamente 3 segundos com HUD, áudio, movimento e ataques, em janela de 1440 × 900. O modo alto mediu 9,46 FPS no teste isolado da cena; use **LQ** nessa placa. As medições e o tamanho da amostra estão no relatório do navegador.
