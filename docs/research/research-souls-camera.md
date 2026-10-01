# Pesquisa e implementação da câmera de duelo

> Registro da engenharia de enquadramento em 2026-10-01. A integração final inicia cada partida com o alvo fixado e acrescenta intensidade por combo/impacto com FOV limitado a 52–61°, desligada em movimento reduzido. A composição geométrica descrita aqui continua usando foco, distância e margens; a afirmação de ausência de zoom de FOV abaixo se refere somente a essa camada. Consulte o [índice atual](README.md) e o [relatório integrado](../../evidencias/oil-island-validation.json).

Data: 2026-10-01. Escopo autorizado: bloco de câmera em `neon-clash/scene.js` e teste isolado. Sem alteração de input, arena, pose, cutscene ou publicação.

## Referências primárias

- [Three.js MathUtils](https://threejs.org/docs/pages/MathUtils.html): amortecimento usa delta de tempo; a implementação adota `1 - exp(-lambda * dt)` para que a resposta não dependa da contagem de quadros.
- [Unity Cinemachine Third Person Follow](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineThirdPersonFollow.html): referência de pivô independente, composição de ombro, margem volumétrica para evitar câmera dentro de sólidos e amortecimento distinto ao entrar e sair de oclusão.
- [Unity Cinemachine Deoccluder](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineDeoccluder.html): referência para pós-processar a posição final, aproximar antes do obstáculo e usar volumes seletivos em vez de percorrer toda geometria detalhada.
- [Unity Cinemachine Group Framing](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineGroupFraming.html): referência para enquadrar um grupo por distância e espaço útil de tela. Aplicação neste jogo: jogador e rival, incluindo pés, cabeça e largura corporal, margens para HUD e retrato.

Essas referências orientam a engenharia de uma câmera terceira pessoa; não demonstram uma réplica da implementação interna de Dark Souls ou Elden Ring.

## Problemas reproduzidos

1. `rotateCamera` alterava o yaw dos controles, mas `camera.position.lerp` atrasava o yaw visual: movimento relativo à câmera seguia outra direção por vários quadros.
2. Qualquer input suspendia enquadramento do rival por 3,5 segundos; em grande separação o corpo saía da tela.
3. Colisão era resolvida antes do lerp cartesiano; o quadro final ainda podia atravessar o sólido recém-encontrado.
4. `Infinity` atravessava a sanitização `Number(dx) || 0` e contaminava a matriz da câmera.

O primeiro teste executado confirmou quatro falhas, com dois controles existentes passando (enquadramento sem input e amortecimento em alvo estático).

## Decisão e plano

Alternativas consideradas: câmera fixa bilateral é previsível, mas perde exploração; orbitar totalmente livre durante lock preserva liberdade, mas esconde o rival; câmera de ombro com ajuste limitado durante lock preserva a leitura do duelo e é a opção escolhida. Modo livre oferece órbita completa.

- [x] Reproduzir bugs com THREE real sem WebGL e sem substituir matemática por mocks.
- [x] Separar yaw responsivo de suavização de foco/distância. Proteger entrada não finita.
- [x] Manter o grupo enquadrado durante input manual de lock; retomar suavemente o ombro padrão após 0,9 s.
- [x] Intersectar segmento com volumes expandidos pelo raio da câmera; corrigir o resultado final. Entrada no obstáculo imediata, recuperação amortecida.
- [x] Usar volumes simples para grandes props próximos da arena; preservar cutscene externa com prioridade no chamador.
- [x] Verificar paisagem, paisagem baixa, retrato, ambos jogadores locais, colisão e 30/60/120 Hz.

API preservada: `rotateCamera(dx,dy)` em radianos; `zoomCamera(delta)` em unidades; `setLockOn(bool)`, `resetCamera(state)`, `cameraInput(x,z)` e `cameraInfo()`. A distância de zoom solicitada permanece distinta da distância efetiva necessária para enquadramento/obstáculo. A intro do heliponto pode sobrescrever `camera.position` e `camera.lookAt` após `updateCamera` sem alterar o controle de entrada.

## Resultado e limites da evidência

`node --check scene.js`: passou. `node --test tests/camera-tests.cjs`: 9 testes passaram, zero falhas. O teste de cantos percorre 48 combinações: quatro arenas, quatro cantos e três deslocamentos manuais. O teste de tela verifica 1280×720, 390×844 e 844×390, ambos índices locais, humano/cão e salto. As matrizes e projeções são de THREE real; o harness não inicia um renderer. A resposta em alvo estático também foi comparada em 30, 60 e 120 Hz.

Quatro regressões tinham falhado antes da implementação: atraso entre yaw visual e movimento, perda do rival durante input manual, interpolação atravessando obstáculo e entrada Infinity. Todas passaram depois.

O modo livre aplica 360 graus sem restringir ao adversário. O modo fixado aceita até ±1,1 radiano em torno da direção do duelo, acompanha o rival mesmo durante input e retorna ao ombro de 0,45 radiano após 0,9 segundo. `cameraInfo()` preserva campos anteriores e acrescenta `effectiveDistance` e `obstructed`.

Os volumes de cenário são aproximações conservadoras para props grandes, acrescidas aos colliders fornecidos por cada arena; não representam individualmente cada folha, corda, placa ou helicóptero animado. A câmera tenta elevar o boom em até seis posições para manter os corpos inteiros antes de comprimir a distância. A recuperação de distância é suave quando o enquadramento permite; impedir corte dos corpos tem prioridade no modo fixado. A composição não usa zoom de FOV.

A evidência CPU verifica projeção dentro da tela e ausência de interseção dos volumes cadastrados no caminho até o foco nos cenários testados; não substitui inspeção visual de sobreposição dos personagens, dos detalhes decorativos, da interação com o HUD ou a sensação de controle. A validação visual integrada ficou com o agente principal e com o agente de controles. Cutscene, pose e física de combate não foram alteradas por esta etapa.

Integração: incluir `tests/camera-tests.cjs` no comando de testes do projeto. `git diff --check` geral apontou whitespace apenas em `style.css:243`, fora do escopo deste agente; a câmera não tinha erro de whitespace.
