# Arte dos personagens

`faces-v5.js` incorpora o atlas facial e o retrato de Orelha como URLs de dados, para funcionar tanto no servidor quanto em `file://`. Nenhuma imagem é buscada fora do jogo.

O atlas dos quatro humanos foi gerado com a ferramenta imagegen a partir das referências fornecidas pelo usuário. A última correção do Mímico usa franja lisa, reta e alinhada em corte tigela, mantendo óculos alaranjados. A foto de Orelha fornecida pelo usuário é usada no cartão da seleção. Os modelos 3D e suas animações são implementados nos arquivos `fighters-human.js`, `fighters-dog.js` e `fighter-faces.js`.

Disposição do atlas: Veterano superior esquerdo; Titã superior direito; Mímico inferior esquerdo; Pixel inferior direito. O mesmo atlas alimenta os retratos e a superfície frontal das cabeças 3D.

`titan-shirt.js` incorpora a arte da camiseta como URL de dados com transparência. A ferramenta imagegen recriou as formas verticais azul/ciano e bordas escuras da estampa fornecida pelo usuário; o modelo aplica o decalque curvado sobre o tecido. Chapéu, óculos escuros, corrente e letras AS no short são elementos construídos no modelo.

`materials-v5.js` inclui três imagens de materiais geradas com imagegen: denim índigo lavado, tecido neutro de trama fina e pelos curtos em escala de cinza. O denim mantém sua cor própria; tecido e pelagem são modulados pelas cores dos modelos. O pacote continua local e offline. A geometria e os UVs controlam a escala da trama; o relevo fica discreto para evitar ruído em movimento.

Direção dos prompts finais: preservar no denim o azul desbotado da última referência do Mímico, com trama diagonal e desgaste irregular; usar tecido claro neutro com fibras e pequenas rugas, sem costuras ou elementos de roupa incorporados; criar pelos curtos direcionais semelhantes aos do Orelha, em cinza para preservar as marcações de cor do modelo. Todos são materiais planos, sem pessoas, cenário, iluminação direcional ou texto.

Orelha usa uma cabeça canina fechada, com crânio, bochechas e focinho em volume, e o mesmo material de pelo do corpo. As marcações pretas, caramelo e grisalhas são definidas na superfície; olhos e nariz têm geometria própria. As duas últimas fotos guiam suas proporções e cores. O retrato da seleção conserva a foto fornecida pelo usuário.
