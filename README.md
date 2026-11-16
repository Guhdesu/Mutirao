# Mutirão

**Computação distribuída e voluntária no navegador: cada celular pinta um pedaço da imagem.**

Trabalho de Sistemas Distribuídos (Tema 1). Uma imagem fractal de 1600×900 é dividida em 576 blocos de 50×50.

1. **Sozinho:** o notebook (Host A) calcula todos os blocos em fila, com uma thread, e o tempo é cronometrado.
2. **Mutirão:** os colegas leem o QR code e o celular de cada um vira um nó de processamento. Os blocos são distribuídos sob demanda, o host junta os resultados e o painel mostra quem gerou cada bloco, o tempo e o ganho de velocidade.

Não precisa instalar nada no celular: basta Android ou iPhone com o navegador.

## Como funciona

```
Celulares (/join)  ── Socket.IO ──  Coordenador (Node.js)  ── Socket.IO ──  Painel (/)
Web Workers calculam               fila de blocos, leases,                   monta a imagem,
os blocos recebidos                reatribuição, métricas                    mostra métricas
```

| Conceito                  | Onde está no código |
|---------------------------|---------------------|
| Divisão em grade (tiles)  | `server/job.js`, `buildTiles()` |
| Distribuição sob demanda  | `server/coordinator.js`, `dispatch()`: quem fica livre recebe o próximo bloco, sem divisão fixa |
| Adaptação à capacidade    | cada aparelho recebe `threads × 2` blocos por vez, então quem é mais rápido pega mais |
| Tolerância a falhas       | se um aparelho cai ou não responde dentro do *lease*, o bloco volta para a fila (`checkLeases()`, `requeueAll()`) |
| Paralelismo local         | `public/pool.js`: um Web Worker por núcleo do celular |
| Corretude                 | hash FNV-1a da imagem: sozinho e mutirão precisam dar o mesmo hash |

### As duas cargas

- **Calibrada (use na apresentação).** Cada bloco custa um tempo fixo de CPU, que pode ser 100, 150 ou 200 ms. O worker calcula o fractal e depois executa um laço ocupado até completar esse tempo. É uma **carga sintética** que simula uma tarefa pesada de tamanho conhecido. Com isso a comparação fica previsível: sozinho leva cerca de 576 × 150 ms ≈ 86 s, e o mutirão divide esse tempo pelo número de threads conectadas, descontado o overhead de rede.
- **Real.** É o Mandelbrot puro, com 16 amostras por pixel. O ganho depende da CPU de cada aparelho.

### Métricas

O painel mostra o tempo sozinho, o tempo em mutirão, o ganho (*speedup*), a eficiência por thread, o número de dispositivos e threads, os blocos reatribuídos e se o hash confere. Também há uma linha do tempo por dispositivo e o placar de voluntários.

O histórico de todas as rodadas pode ser exportado:
- `/api/runs.csv`
- `/api/runs.json`

## Deploy no Render (grátis, a partir deste repositório)

1. Entre em <https://render.com> com a conta do GitHub.
2. Clique em **New → Blueprint** e escolha o repositório `Mutirao`.
3. Confirme. O `render.yaml` já configura tudo: plano free, `npm install` e `npm start`.
4. Em 2 a 3 minutos sai a URL `https://mutirao-xxxx.onrender.com`. O painel fica na raiz e os celulares entram em `/join`.

Cada push na `main` gera um deploy automático.

> O plano free **dorme depois de 15 min sem acesso** e leva cerca de 50 s para acordar. Abra o painel uns 5 minutos antes de apresentar.

### Plano B: rodar no notebook

```bash
npm install
npm start
```

O painel fica em `http://localhost:3000`, e o QR já aponta para o IP da rede local.

Se a rede da sala isolar os aparelhos, use uma das saídas abaixo.

Para deixar a URL pública, sem conta:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Ou crie um hotspot no notebook e peça para a turma se conectar nele.

## Checklist do dia

- [ ] Abrir o painel (URL do Render) 5 minutos antes, no notebook do projetor
- [ ] Colocar o QR (ou a URL `/join`) no slide da demonstração
- [ ] Escolher a carga **Calibrada, 150 ms**
- [ ] **Rodar sozinho**: explicar a fila de blocos enquanto roda (cerca de 86 s)
- [ ] Pedir para a turma entrar e esperar o contador de voluntários subir
- [ ] **Rodar em mutirão**, depois alternar para **Quem gerou** e mostrar o placar e o ganho
- [ ] Baixar o CSV para os slides de resultados

## Ensaio com celulares simulados

```bash
npm i -D playwright
npx playwright install chromium
```

```bash
node scripts/bots.js --url https://mutirao-xxxx.onrender.com --n 8 --threads 2
```

Abrir `/?view` em outra aba mostra o painel só para visualização, sem assumir o papel de host.

## Estrutura

```
server/index.js         HTTP, Socket.IO, QR code, exportação
server/coordinator.js   fila, distribuição, leases, métricas
server/job.js           imagem, blocos e cargas
public/index.html       painel do projetor (também é o Host A)
public/join.html        página do voluntário
public/fractal.js       cálculo do Mandelbrot (determinístico) e cores
public/render-worker.js Web Worker que calcula um bloco
public/pool.js          pool de workers usado pelo painel e pelos celulares
```

Grupo: Cristovam Barreiros, Denny Carmo, Eric Fernandes, Gustavo Ferreira, Isis Vasconcelos e Johnny Reis.
