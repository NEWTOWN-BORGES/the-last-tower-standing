# CORREDOR — protótipo web

Jogo de cartas 1v1 para telemóvel, sistema "Pressão". Vais construir um protótipo jogável no browser (dois jogadores no mesmo ecrã ou contra uma IA simples — a tua escolha de arquitectura). Este ficheiro é o teu contexto permanente; `cartas.json` tem os dados de todas as cartas; `assets/` tem as imagens.

## Stack sugerida
HTML/CSS/JS puro ou React — o que achares mais rápido para um protótipo. Sem backend por agora: estado do jogo em memória, tudo client-side.

## O tabuleiro
Cada jogador tem:
- **3 espaços na linha da frente** (Tanques, Guerreiros, Assassinos)
- **2 espaços na retaguarda** (Atiradores, Curadores)
- **1 zona de Apoio** — onde os Apoios se resolvem e saem; não ocupam espaço de unidade

Ao centro: **uma barra de domínio de 16 casas**, cabo-de-guerra, começa a 8-8. Não há vida total por jogador — há uma barra só, partilhada.

## O turno
1. Energia = número do turno + 1, até ao máximo de 8
2. Ambos os jogadores colocam cartas **ao mesmo tempo** (simultâneo, não alternado)
3. Resolve-se o turno (ver combate)

## Combate
- Cada unidade da linha da frente ataca a que está **na mesma coluna**, do lado oposto
- Coluna inimiga vazia → um **Tanque** inimigo (se houver) intercepta o ataque em vez da barra ser atingida
- Sem Tanque para interceptar → o ataque empurra a barra directamente
- **Atiradores** (retaguarda) disparam contra o alvo com menos Vida do adversário
- **Assassinos** ignoram a linha da frente e atacam a retaguarda inimiga directamente

## Invocação lenta
Uma carta **não ataca no turno em que entra em campo**. Excepção: os **Assassinos**, que atacam logo ao entrar.

## Pressão (o motor do jogo)
Cada carta que sobrevive um turno inteiro ganha **1 marca de Pressão** (máx. mostrado: 2 pontos).
Ao atingir **2 marcas**, a carta **Rompe**: nesse turno ignora o que tem à frente e ataca directamente a barra de domínio. Depois volta a 0 marcas.
Contra um adversário com Alinhamento **SOMBRA**, precisas de **3 marcas** em vez de 2 (efeito do alinhamento).

## Escudo
Estatística extra que absorve dano **antes** da Vida. Não regenera sozinho. Os **Tanques** entram em jogo com **Escudo 2** (já vem no campo `escudo` do JSON).

## Cartas de Apoio
- Custam sempre **0 energia**
- Podem jogar-se **quantas vezes se quiser no mesmo turno**
- **Repõem-se**: jogar um Apoio faz o jogador comprar 1 carta do baralho
- Resolvem-se na zona de Apoio própria (nunca ocupam espaço de unidade)

## Fim da partida
A barra chega a uma das pontas (0 ou 16) → vitória imediata. Limite de segurança: 12 turnos; se ninguém tiver vencido, ganha quem tiver a barra mais próxima do seu lado.

## Tipagem (14 tipos — só fraqueza/resistência, sem sinergia)
Ataque contra tipo fraco: **+40%**. Contra tipo resistente: **−40%**.

| Tipo | Forte contra | Fraco a |
|---|---|---|
| Fogo | Plantas, Metal | Água, Terra |
| Água | Fogo, Terra | Plantas, Vento |
| Plantas | Água, Terra | Fogo, Vento |
| Vento | Plantas, Besta | Água, Terra |
| Terra | Metal, Fogo | Água, Plantas |
| Anjo | Demónio, Sombra | Demónio |
| Demónio | Ancestral, Normal | Anjo, Luz |
| Ancestral | Anjo, Demónio | Fogo |
| Fada | Metal, Terra | Metal |
| Luz | Sombra, Demónio | Sombra (única) |
| Sombra | Luz, Anjo | Luz (única) |
| Metal | Fada, Plantas | Fogo, Terra, Vento |
| Besta | Plantas, Normal | Vento, Anjo |
| Normal | — | — |

## Alinhamentos (por sub-grupo, ver campo `alinhamento` no JSON)
| Alinhamento | Bónus |
|---|---|
| ORDEM | +1 Ataque a cartas de custo 3+ |
| PUREZA | Quando uma carta tua morre, uma aliada ganha Escudo 2 |
| SELVA | +1 Vida por turno sobrevivido, até +3 |
| MAGIA | −1 energia a cartas de tipo elemental (Fogo/Água/Plantas/Vento/Terra) |
| SOMBRA | Cartas inimigas precisam de +1 marca para Romper (3 em vez de 2) |
| NEUTRO | Sem bónus; não quebra o alinhamento do baralho |

**Coesão do baralho:** ORDEM e PUREZA contam como a mesma família; SELVA e MAGIA idem. Misturar a família Ordem com a família Selva faz **perder os dois bónus**. SOMBRA é família à parte. NEUTRO nunca quebra nada.

## Papéis (campo `papel`)
Tanque · Guerreiro · Assassino · Curador · Atirador — cada um já tem os stats certos no JSON.

## Construção de baralho
20 cartas, máx. 2 cópias da mesma carta, Lendárias e Heróis só 1 cópia (e só 1 Herói por baralho).

## Dados
- `cartas.json` — as 127 cartas (100 unidades em `unidades`, 27 apoios em `apoios`), já com alinhamento corrigido por sub-grupo, custo comprimido para 1-5, e escudo dos Tanques preenchido
- `assets/cartas-3d/` — arte das 100 unidades (750×1050 PNG, moldura incluída)
- `assets/apoios-3d/` — arte dos 27 apoios (750×1050 PNG, moldura incluída)

As imagens já vêm com moldura, nome, stats e texto desenhados — para o protótipo podes usá-las tal como estão (mostrar a imagem inteira da carta) em vez de recriar o layout em HTML/CSS. Mais rápido para um protótipo jogável.

## Por construir
- Lógica de jogo (turnos, colocação, resolução de combate, Pressão, barra)
- IA simples para jogar contra (ou modo 2 jogadores no mesmo ecrã)
- UI: zona de apoio separada do campo de batalha, marcas de Pressão visíveis, barra de domínio ao centro
- Deckbuilder simples que valide as regras de construção acima
