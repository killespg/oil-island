# Multiplayer no navegador

O cliente mantém Three.js e Web Audio, sem downloads externos para gráficos ou som. O backend é TypeScript, compilado para Node.js, com WebSocket na mesma origem do jogo. Uma instalação serve a página e as partidas; não precisa de banco de dados para os duelos privados.

## Testar em dois computadores

Requisitos do servidor: Node.js 24 LTS e npm. Os jogadores só precisam de navegador com WebGL e WebSocket.

```sh
git pull
npm ci
npm start
```

Abra `http://localhost:3000` na máquina servidora, ou `http://IP-DO-SERVIDOR:3000` em outros PCs da mesma rede. Use o endereço da rede também no computador servidor se quiser copiar um convite que funcione no outro PC. Um convite com `localhost` não aponta para a máquina do amigo.

1. Selecione uma arena e abra **DUELO ONLINE**.
2. Escolha **CRIAR SALA PRIVADA** e copie o convite.
3. O amigo abre o link e confirma **ENTRAR**. Também pode digitar o código no mesmo servidor.
4. A luta começa quando os dois estiverem conectados. São dois rounds vencedores; cada jogador pode aceitar a revanche no resultado.

`Abrir jogo.sh` e `index.html` via `file://` continuam sendo atalhos para o modo solo offline. Para o online, use o endereço HTTP(S) do servidor.

## Hospedar na internet

Use uma máquina ou serviço capaz de executar um processo Node continuamente e encaminhar WebSocket. O servidor escuta na porta indicada por `PORT`, padrão 3000. O endereço público deve usar HTTPS e encaminhar tanto a página quanto `/ws` para a mesma instância. O navegador escolhe `wss://` automaticamente em HTTPS.

Preparação para produção:

```sh
npm ci
npm run build:server
npm prune --omit=dev
ALLOWED_ORIGIN=https://jogo.seu-dominio.com npm run start:production
```

O domínio acima é um exemplo. Configure seu DNS e um proxy com certificado TLS. O proxy precisa encaminhar o upgrade WebSocket em `/ws`; não armazene essa rota em cache. `ALLOWED_ORIGIN` deve ser a origem pública exata, sem barra final ou caminho. Ela é necessária quando um proxy termina HTTPS e conversa com Node por HTTP.

O projeto também inclui um container, que compila o servidor e executa com usuário sem privilégios:

```sh
docker build -t neon-clash .
docker run --rm --name neon-clash -p 3000:3000 \
  -e ALLOWED_ORIGIN=https://jogo.seu-dominio.com \
  -e ALLOW_NO_ORIGIN_LOOPBACK=0 \
  neon-clash
```

Para testar o container diretamente na rede local por HTTP, omita `ALLOWED_ORIGIN`. A configuração de produção acima pressupõe um proxy HTTPS à frente do container. Não há serviço, domínio ou hospedagem contratados por estes comandos de exemplo.

| Variável | Padrão | Função |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `PORT` | `3000` | Porta HTTP e WebSocket |
| `ALLOWED_ORIGIN` | Origem HTTP do próprio servidor | Origens públicas permitidas, separadas por vírgula |
| `MAX_ROOMS` | `64` | Limite de salas simultâneas; não representa capacidade medida |
| `MAX_CONNECTIONS` | `160` | Limite de conexões WebSocket |
| `ALLOW_NO_ORIGIN_LOOPBACK` | `1` | Permite ferramentas locais sem cabeçalho Origin; use `0` para exigir origem também no loopback |

`GET /healthz` retorna disponibilidade, número de salas/conexões e taxas configuradas. SIGINT/SIGTERM encerram os timers e conexões. Salas ficam em memória; reiniciar o servidor encerra todas. Use uma única instância neste estágio: escalar para várias exige roteamento consistente das salas ou um serviço compartilhado de matchmaking.

Hospedagem estática, incluindo GitHub Pages, distribui os arquivos mas não executa o processo das partidas. Uma VPN/rede privada também permite conectar amigos ao servidor local. Expor um servidor residencial diretamente depende de encaminhamento de portas e da disponibilidade de acesso público pelo provedor.

## Como a fluidez funciona

- O servidor avança o combate em passos fixos de 1/60 segundo, com no máximo quatro passos de recuperação por ciclo sob atraso. Publica estados a cada três passos.
- Cada jogador envia comandos numerados. O servidor aceita apenas movimentos e ações válidos, calcula recursos, dano, rounds e resultado, e confirma os comandos processados. Vida, posição final, dano e relógio enviados pelo cliente não são usados como autoridade.
- O cliente executa imediatamente uma previsão do comando. Ao chegar um estado confirmado, restaura a simulação e reaplica os comandos ainda não confirmados. O gerador aleatório faz parte do estado serializável.
- A apresentação suaviza correções pequenas do jogador local. O adversário aparece interpolado com cerca de 83 ms de buffer e extrapolação limitada a dois ticks. Som e efeitos de acerto são emitidos pelo resultado confirmado, evitando duplicá-los durante a reaplicação.
- A qualidade AUTO tenta preservar luzes e bloom reduzindo a resolução do 3D. A interface HTML não perde resolução. Um contexto gráfico recuperado permanece em LQ até escolha manual.

Essa primeira versão não faz retrocesso de hitboxes no servidor para compensar ping. Com latência alta, a confirmação do contato ainda demora e pode divergir da previsão. Um servidor próximo dos jogadores ajuda; previsão não corrige distância geográfica, perda de conexão ou falta de desempenho do aparelho.

## Limites e verificações

São duelos privados de dois jogadores. Não há contas, ranking global, espectadores, reconexão automática ou matchmaking público. O servidor controla o resultado, mas isso não equivale a um sistema completo contra bots ou outras formas de trapaça. O menu de pausa online não interrompe a partida; sair ou desconectar encerra a sala. Recarregar a página também desconecta.

O protocolo limita tamanho/frequência de mensagens, filas de comandos, conexões e salas. Entradas inativas são neutralizadas após 200 ms; salas sem segundo jogador e salas concluídas expiram após cinco minutos. O servidor publica somente uma lista explícita de arquivos do cliente, nunca o diretório do projeto inteiro.

```sh
npm test
npm run test:online
```

Os testes sem navegador cobrem lógica, previsão/reconciliação, duas conexões reais, validação de comandos, limite de filas, origem HTTP, arquivos privados, desconexão, limpeza e revanche. A integração da interface usa uma VM com DOM/renderizador simulados. Os testes não são uma avaliação visual, medição na RX 7600 ou teste de rede de longa distância. Os relatórios gráficos `evidencias/v2-*` pertencem à versão anterior; nenhuma janela do jogo foi aberta durante esta implementação.

As decisões de rede foram conferidas com as referências primárias [ws](https://github.com/websockets/ws) e [previsão/reconciliação do Colyseus](https://docs.colyseus.io/netcode/client-prediction). O código usa `ws` e a simulação compartilhada do Neon Clash; Colyseus não é uma dependência.
