# API / console

O console aceita uma linguagem no estilo Python: números, strings, tuplas, listas, `True/False/None`,
variáveis (`a = g.point((0, 0))`) e comentários com `#`. `Tab` completa. Cada ação da interface
aparece aqui como o comando equivalente.

Objetos: **`g`** Geometria · **`m`** Malha · **`s`** Método de resolução · **`r`** Resultados.
Comprimentos: número na unidade do projeto ou string com unidade (`"5 mm"`). Coordenadas de pontos
são em mm.

## Geometria (`g.`)

| Comando | Descrição |
|---|---|
| `point((x, y))`, `line(a, b)`, `circle(c, r=5)`, `arc(c, ini, fim)` | entidades (aceitam `id=`, `construction=True`, `name=`) |
| `rectangle(p1, p2)`, `rectangle_center(c, p)` | retângulos (agrupados) |
| `horizontal`, `vertical`, `parallel`, `perpendicular`, `tangent`, `equal`, `coincident`, `point_on`, `midpoint`, `symmetric`, `concentric` | restrições |
| `distance(a, [b,] "50 mm")`, `hdistance`, `vdistance`, `radius`, `diameter`, `angle` | cotas (valor ou expressão) |
| `var("g", "0.5 mm")`, `set_dimension("k5", "g*2")` | variáveis e cotas |
| `offset(ids, "2 mm")`, `set_offset(g, "5 mm")`, `mirror(ids, axis="y")`, `array(...)`, `array_circular(...)` | operações associativas |
| `units("mm")`, `problem("planar", depth="100 mm")` | problema |
| `constraint(tipo, refs, id=…, …)`, `group_def(id, …)`, `next_id(n)`, `clear()` | baixo nível (script exportado) |

## Malha (`m.`)

| Comando | Descrição |
|---|---|
| `material("Cobre", mur=1, sigma=58, br=0, color=…, bh=[(H, B), …])` | cria/edita material |
| `circuit("Bobina", current="10")` | cria/edita circuito |
| `region((x, y), name=…, material=…, circuit=…, current=…, turns=…, angle=…)` | atribui à região que contém o ponto |
| `boundary_def("Nome", type="dirichlet"|"neumann"|"periodic"|"antiperiodic", value=…)`, `boundary(curvas, "Nome")` | contornos |
| `mesh_size((x, y), "1 mm")`, `settings("n1", size=…, min_angle=30)`, `generate()` | malha |

## Resolução (`s.`) e resultados (`r.`)

| Comando | Descrição |
|---|---|
| `s.physics("n2", analysis="magnetostatic")`, `s.solve()` | resolver |
| `r.view(física)`, `r.interpolate(física, level=3)`, `r.table(física)` | vistas e tabelas (abas) |
| `r.plot(vista, "surface"|"contour"|"arrow"|"line", quantity="b"|"h"|"a"|"j"|"bn"|"bt")` | camadas |
| `r.item(tabela, "circuits"|"lineint"|"surfint")` | itens de tabela |
| `r.show(id, visible=, range=, n_lines=, color=, colormap=, curve=, regions=[(x, y)], legend=(x, y, s), legend_bg=)` | opções |
| `r.move(camada, vista)`, `r.duplicate(id)`, `r.remove(id)` | organização |

## Script exportado

O botão `</>` ao lado de **Modelo** gera um script que começa com `clear()` e recria tudo com os
mesmos ids (entidades, restrições, grupos, materiais, regiões, árvore). Ele é validado por um teste
de ida e volta (o modelo recriado é idêntico ao original).


## Resultados como números (scripts)

| Comando | Devolve |
|---|---|
| `r.result("Fx", physics="n2")` | valor de uma variável de resultado (no instante mostrado, se transitório) |
| `r.results("n2")` | lista `[(nome, valor, unidade), ...]` |
| `r.series("Primario_I")` | transitório: `(tempos em s, valores)` |

## Ponte com scripts locais

`python -m magfem` (pasta `bridge/python`) sobe um servidor em `127.0.0.1:8765` e mostra uma chave.
No app, **Script local** → porta e chave. Scripts mandam linhas do console por `POST /run`
(`{"code": "..."}`, cabeçalho `X-MagFEM-Key`); a resposta traz `ok`, `value` (valor da última linha),
`out` e, em erro, `error` e `line`. `s.solve()` e `m.generate()` são esperados antes da linha seguinte.
Cliente Python: `magfem.connect()`, `mf.run`, `mf.set_var`, `mf.solve`, `mf.result`, `mf.results`,
`mf.series` — ver `bridge/python/README.md`.
