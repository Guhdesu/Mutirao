# Roteiro: Gustavo (funcionamento e demonstração)

Duração prevista: **8 a 10 minutos**, contando cerca de 3 minutos de demonstração ao vivo.
Entra depois do Johnny (tecnologias) e passa a palavra para o Eric (resultados).

Os trechos em *[colchetes]* são ações, não são falados.

---

## Antes de começar

- [ ] Abrir a URL do Render no notebook uns **5 minutos antes**, porque o servidor gratuito leva cerca de 50 s para acordar.
- [ ] Deixar o painel aberto numa aba, pronto para trocar com os slides (Alt+Tab).
- [ ] No painel, escolher a carga **Calibrada** com **150 ms** por bloco.
- [ ] Testar com o próprio celular: entrar pelo QR e ver o contador de voluntários subir.
- [ ] Pedir ao grupo para **não abrir o link principal** no celular, só o `/join`. O rodapé do painel deve dizer "painel principal".
- [ ] Se possível, pedir para a turma entrar **já durante os slides dos colegas**. Quanto mais gente conectada, maior o ganho.

---

## Slide 1: Funcionamento e demonstração (≈ 30 s)

> Agora eu vou mostrar a aplicação funcionando de verdade. O nome dela é **Mutirão**. Mutirão é aquele trabalho coletivo em que cada um faz um pedaço para terminar algo grande, que é exatamente a ideia da computação voluntária que o Denny acabou de explicar.
>
> Vou explicar em quatro partes: como a imagem é gerada, como o trabalho é dividido entre os aparelhos, como a imagem é remontada e, por fim, a demonstração ao vivo com os celulares de vocês.

## Slide 2: Mutirão, cada celular pinta um pedaço (≈ 45 s)

> Isso aqui é o painel que vai ficar no projetor. A aplicação inteira roda no navegador: quem quiser ajudar só abre um link no celular, sem instalar nada.
>
> Por trás tem um servidor que a gente chama de **coordenador**. Ele divide a imagem em pedaços, entrega esses pedaços para quem está conectado e junta tudo de volta.
>
> E tudo é medido: quanto tempo o notebook leva sozinho, quanto tempo leva com todo mundo junto e qual aparelho calculou cada pedaço. Essas letras coloridas em cima da imagem são justamente isso: cada letra é um aparelho.

## Slide 3: Como a imagem é gerada (≈ 1 min)

> A imagem é um fractal, o **conjunto de Mandelbrot**. Para descobrir a cor de cada pixel, o computador repete uma conta simples, *z ao quadrado mais c*, até 3 mil vezes, e vê quantas repetições leva para o número "escapar". Esse número vira a cor.
>
> São 1600 por 900 pixels, ou seja, **um milhão e quatrocentos mil pixels**, e alguns precisam das 3 mil repetições. É um trabalho pesado de propósito.
>
> O ponto principal: **cada pixel não depende de nenhum outro**. Isso permite cortar a imagem em pedaços e mandar cada pedaço para um aparelho diferente. A gente corta em **576 blocos de 50 por 50 pixels**, que é essa grade que vocês estão vendo.

## Slide 4: Como os aparelhos se conectam (≈ 1 min)

> Aqui está a estrutura do sistema, em três partes.
>
> À esquerda, os **voluntários**: os celulares de vocês. Cada um abre uma página e, dentro dela, roda um **Web Worker** por núcleo do processador. Assim o celular calcula mais de um bloco ao mesmo tempo sem travar a tela.
>
> No meio está o **coordenador**, um servidor em Node.js hospedado na nuvem, no Render. Ele guarda a fila de blocos e decide quem faz o quê.
>
> À direita está o **painel**, que é este notebook. No slide de vocês ele aparece como Host A: monta a imagem, mostra as estatísticas e também ajuda a calcular.
>
> Tudo conversa por **Socket.IO**, que usa WebSocket: uma conexão que fica aberta nos dois sentidos. Como o servidor está na internet, vocês podem entrar pelo 4G ou pelo Wi-Fi, tanto faz.

## Slide 5: Distribuição sob demanda (≈ 1 min 15 s)

> Agora, como o trabalho é dividido. A gente **não** diz "você faz a parte de cima, você faz a de baixo". Isso seria divisão fixa, e o grupo inteiro ficaria esperando o celular mais lento.
>
> O que a gente faz é **distribuição sob demanda**, em quatro passos:
> 1. Todos os blocos ficam numa **fila** no coordenador.
> 2. Quem está livre **recebe** o próximo bloco. Cada aparelho segura até dois blocos por thread, para não perder tempo esperando a rede.
> 3. O aparelho **calcula**.
> 4. **Devolve** os pixels e já recebe o próximo.
>
> Com isso, celular rápido naturalmente pega mais blocos e celular lento pega menos.
>
> E tem **tolerância a falhas**: se alguém fecha a página, bloqueia a tela ou perde o sinal, o coordenador percebe em uns cinco segundos e devolve aquele bloco para a fila. Outro aparelho calcula e a imagem termina do mesmo jeito.

## Slide 6: Reunindo a imagem (≈ 1 min)

> Quando um aparelho termina um bloco, ele não manda uma imagem pronta. Manda só os números, quantas repetições cada pixel levou: **2.500 números, uns 5 kilobytes**. Isso é leve para a rede.
>
> O painel recebe, coloca o bloco na posição certa, x e y, e transforma os números em cor. Como ele sabe quem mandou cada bloco, consegue mostrar isso na imagem: cada cor e cada letra é um aparelho.
>
> E como a gente garante que distribuir não estragou nada? No final, o coordenador calcula um **hash**, uma espécie de impressão digital da imagem inteira. Se o hash do mutirão for igual ao do notebook sozinho, a imagem é idêntica, pixel por pixel. O painel mostra essa conferência.

## Slide 7: Demonstração (≈ 3 min)

*[Trocar para o painel no navegador. Conferir: carga Calibrada, 150 ms.]*

> Vamos para a demonstração. Primeiro, o notebook sozinho.

*[Clicar em **Rodar sozinho**.]*

> Ele vai calcular os 576 blocos um atrás do outro, com uma única thread, como um servidor central sem ajuda. Cada bloco custa 150 milissegundos, então isso leva perto de **um minuto e meio**.

*[Enquanto roda, aproveitar o tempo:]*

> Já podem pegar o celular: abram a câmera, apontem para o **QR code** no canto do painel, digitem o nome e toquem em **Participar**. A tela de vocês vai mostrar uma letra; aquela letra é o seu aparelho. **Deixem a tela ligada.**

*[Esperar o contador de voluntários subir. Quando o modo sozinho terminar:]*

> Pronto, esse é o nosso tempo de referência. Agora o mutirão.

*[Clicar em **Rodar em mutirão**.]*

> Olhem a imagem se montando com as cores de todo mundo misturadas.

*[Quando terminar, trocar para **Quem gerou**:]*

> Cada cor é o celular de alguém. Procurem a sua letra.

*[Rolar até o **Placar**:]*

> E aqui está o placar: quem calculou mais blocos está em primeiro. Parabéns, *[nome do 1º lugar]*!

*[Apontar para o card de Resultado:]*

> Aqui está o tempo sozinho, o tempo em mutirão e o **ganho de velocidade**: *[ler o número]* vezes mais rápido. E aqui embaixo, "Imagem idêntica: sim". Distribuir não mudou nenhum pixel.

*[Clicar em **Exportar resultados (CSV)** para o Eric.]*

## Slide 8: Como comparamos os tempos (≈ 1 min)

> Para fechar a minha parte: como a gente compara os tempos.
>
> O **ganho de velocidade**, o *speedup*, é o tempo sozinho dividido pelo tempo em mutirão. Se deu 10, o mutirão foi 10 vezes mais rápido. A **eficiência** é esse ganho dividido pelo número de threads; ela mostra quanto se perde com rede e coordenação.
>
> A comparação é justa porque a tarefa é exatamente a mesma: a mesma imagem e os mesmos blocos, medidos pelo mesmo relógio, o do coordenador.
>
> Sobre a **carga calibrada**: cada bloco foi configurado para custar 150 milissegundos de processamento em qualquer aparelho. Fizemos isso para a diferença ficar clara e previsível na sala. É uma carga sintética, que simula uma tarefa pesada. A aplicação também tem o modo "Real", que é só o fractal puro.
>
> E esse é o placar: quem calculou mais blocos fica no topo, com a porcentagem da imagem que cada um fez. Cada faixa colorida mostra o momento em que aquele aparelho estava trabalhando, e a barra cinza em cima é o tempo do notebook sozinho. Dá para ver todo mundo trabalhando ao mesmo tempo e terminando muito antes.
>
> Os números que valem são os que a gente acabou de medir ao vivo. Agora o **Eric** vai analisar esses resultados.

---

## Se algo der errado

| Problema | O que fazer |
|---|---|
| Painel não abre ou demora | O Render está acordando. Esperar uns 50 s e recarregar. Por isso é bom abrir antes. |
| Pouca gente entrou | Rodar mesmo assim: mesmo 3 ou 4 celulares já dão um ganho visível. Os colegas do grupo também entram. |
| O QR não lê | Ditar o endereço curto que aparece embaixo do QR (termina em `/join`). |
| O painel diz "em espera" | Outro aparelho abriu o link principal antes. Clique em **Assumir como painel principal**. |
| Alguém bloqueou a tela no meio | Não faz mal: o bloco volta para a fila sozinho. Dá até para comentar: "olha a tolerância a falhas funcionando". |
| A internet da sala caiu | Plano B: hotspot do celular no notebook, `npm start` e QR da rede local (ver README). |

## Perguntas que podem aparecer

**"Esse tempo de 150 ms não é roubado?"**
É uma carga sintética e a gente diz isso no slide. Ela simula uma tarefa pesada de tamanho fixo, para o resultado não depender de quem tem o celular mais novo. Se quiser ver sem simulação, é só trocar para "Real" no painel e rodar de novo.

**"Por que o ganho não é igual ao número de threads?"**
Por causa do overhead: cada bloco precisa ir e voltar pela internet, e o coordenador gasta tempo distribuindo. É o que a eficiência mede. Isso tem a ver com a **Lei de Amdahl**: a parte que não dá para paralelizar limita o ganho.

**"E se alguém mandar um resultado errado de propósito?"**
Nesta versão, o hash mostra se a imagem final bateu. Sistemas reais de computação voluntária, como o BOINC, mandam o mesmo bloco para dois voluntários e comparam as respostas. Isso se chama **redundância**. Seria a próxima melhoria.

**"Por que não dividir a imagem em partes fixas, uma por celular?"**
Porque os aparelhos têm velocidades diferentes, e todo mundo ficaria esperando o mais lento. Com a fila sob demanda, o mais rápido simplesmente pega mais blocos.

**"Onde está rodando o servidor?"**
No Render, um serviço de hospedagem gratuito na nuvem, que publica direto do repositório no GitHub. Os celulares se conectam a ele pela internet.
