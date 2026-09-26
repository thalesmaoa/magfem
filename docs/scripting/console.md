# Console

Tudo o que você faz na interface aparece no **console** (embaixo do canvas) como o comando equivalente. O
contrário também vale: digitar um comando faz a ação, e o desenho acompanha. É a mesma linguagem usada pelos
scripts da [ponte local](./bridge) e pelo script exportado.

## A linguagem

Uma linguagem com cara de Python:

- números, strings (`"..."` ou `'...'`), tuplas `(x, y)`, listas `[a, b]`, `True`, `False` e `None`;
- argumentos nomeados: `g.circle((0, 0), r=5)`;
- variáveis do console: `a = g.point((0, 0))` guarda o id do ponto criado para usar depois;
- comentários com `#`.

Comprimentos são números na unidade do projeto ou strings com unidade (`"5 mm"`, `"0.2 in"`). Coordenadas de
pontos, como `(x, y)`, são em mm. Ângulos são strings com unidade (`"30 deg"`).

## Objetos

| Objeto | Etapa | Exemplos |
|---|---|---|
| `g` | Geometria | `g.line((0, 0), (40, 0))`, `g.distance("l1", "40 mm")`, `g.var("g", "0.5 mm")` |
| `m` | Malha | `m.region((5, 5), material="mat_cu")`, `m.circuit("Bobina", current="10")`, `m.generate()` |
| `s` | Método de resolução | `s.physics("n2", analysis="transient", dt="0.001", t_end="0.05")`, `s.solve()` |
| `r` | Resultados | `r.view("n2")`, `r.table("n2")`, `r.result("Bobina_L")` |
| `c` | Esquemático | `c.part("n5", "R", value="0.5")`, `c.wire(...)` |

Sem objeto, o comando vale como geometria: `line((0, 0), (10, 0))` é o mesmo que `g.line(...)`.

## Funções globais

| Função | Faz |
|---|---|
| `help()` | lista os comandos |
| `getid("nome")` | id de uma entidade, região ou nó pelo nome |
| `undo()`, `redo()` | desfaz e refaz |
| `fit()` | ajusta a vista |
| `reset()` | começa um projeto vazio, com as bibliotecas padrão (para scripts; o arquivo aberto não muda) |

## Recursos do console

- **Tab** completa comandos, ids, nomes e variáveis; dentro de aspas, sugere ids e nomes do desenho.
- **↑** e **↓** percorrem o histórico.
- O botão de copiar copia o histórico como script; itens desfeitos aparecem em cinza.
- Erros mostram uma mensagem legível, sem mudar o modelo.

## Script exportado

O botão `</>` ao lado de **Modelo** gera um script que começa com `clear()` e recria o projeto inteiro com os
mesmos ids: entidades, restrições, grupos, variáveis, materiais, regiões, contornos, malha, físicas e resultados.
Um teste automático garante a ida e volta (o modelo recriado é idêntico). Dá para colar esse script no console ou
enviá-lo por um script externo, por exemplo para varrer parâmetros.

Veja a [referência completa da API](./api).
