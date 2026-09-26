# Referência da API

Os comandos do [console](./console), agrupados por objeto. Argumentos entre colchetes são opcionais. Ids são
strings (`"l3"`, `"p5"`, `"n2"`); onde se espera um id, também vale o **nome** dado à entidade ou ao nó, e
`getid("nome")` devolve o id. Muitos comandos que criam algo aceitam `id=` (para fixar o id) e `name=`.

## Geometria — `g`

### Entidades

| Comando | Descrição |
|---|---|
| `g.point((x, y))` | ponto |
| `g.line(a, b, construction=False)` | linha; `a` e `b` são coordenadas ou ids de pontos |
| `g.circle(centro, r=5)` | círculo |
| `g.arc(centro, inicio, fim)` | arco anti-horário de `inicio` a `fim` |
| `g.rectangle(canto, oposto)` | retângulo (agrupado, com H/V) |
| `g.rectangle_center(centro, canto)` | retângulo simétrico em torno do centro |

### Restrições

| Comando | Descrição |
|---|---|
| `g.horizontal(l)`, `g.vertical(l)` | linha (ou dois pontos) horizontal/vertical |
| `g.parallel(a, b)`, `g.perpendicular(a, b)` | duas linhas |
| `g.tangent(a, b)` | linha e arco/círculo, ou dois arcos/círculos |
| `g.equal(a, b)` | comprimentos ou raios iguais |
| `g.coincident(a, b)` | dois pontos no mesmo lugar |
| `g.point_on(p, curva)` | ponto sobre a curva |
| `g.midpoint(p, l)` | ponto no meio da linha |
| `g.symmetric(p1, p2, axis="y" \| linha)` | pontos simétricos em relação a um eixo |
| `g.concentric(c1, c2)` | mesmo centro |
| `g.fix(p)`, `g.unfix(p)` | prende/solta um ponto |
| `g.detach("O")` | solta curvas presas à própria Origem (desenhos antigos) |

### Cotas e variáveis

| Comando | Descrição |
|---|---|
| `g.distance(a, [b,] "50 mm")` | distância (linha, dois pontos ou ponto-linha) |
| `g.hdistance(a, b, "10 mm")`, `g.vdistance(a, b, "10 mm")` | distância horizontal/vertical |
| `g.radius(c, "L/2")`, `g.diameter(c, 10)` | raio e diâmetro |
| `g.angle(l1, l2, "30 deg")` | ângulo entre linhas |
| `g.set_dimension("k5", "g*2")` | muda o valor (ou a expressão) de uma cota |
| `g.value("k5")` | valor atual de uma cota |
| `g.var("g", "0.5 mm")` | cria ou muda uma variável |
| `g.del_var("g")`, `g.rename_var("g", "gap")` | apaga e renomeia variáveis |

### Edição

| Comando | Descrição |
|---|---|
| `g.trim(curva, (x, y))` | tesoura: remove o trecho da curva que contém o ponto |
| `g.delete(ids...)` | apaga |
| `g.rename(id, "nome")` | dá nome a uma entidade |
| `g.move(p, (x, y))` | move um ponto |
| `g.translate(ids, dx=5, dy=0)` | translada |
| `g.rotate(ids, "15 deg", pivot=(0, 0))` | gira |
| `g.set_radius(c, 5)` | muda o raio |
| `g.construction(ids, True)` | marca como construção |
| `g.offset(ids, "2 mm")`, `g.set_offset(g, "-5 mm")` | offset associativo e sua distância |
| `g.mirror(ids, axis="y")` | espelho associativo (eixo `"x"`, `"y"` ou uma linha) |
| `g.array(ids, nx=3, ny=1, dx="20 mm", dy=0)` | padrão linear |
| `g.array_circular(ids, n=6, angle="360 deg", center=(0, 0))` | padrão circular |
| `g.set_pattern(g, nx=4, dx="25 mm")` | muda um padrão |
| `g.group([ids], name="rotor")`, `g.ungroup(g)` | agrupa e desagrupa |
| `g.hide(g)`, `g.show(g)` | oculta e mostra um grupo |

### Consulta e problema

| Comando | Devolve / faz |
|---|---|
| `g.get(id)` | a entidade (dicionário) |
| `g.list()` | lista de ids |
| `g.measure(a, b)` | distância mínima entre duas entidades |
| `g.area(ids)` | área fechada pelas curvas |
| `g.dof()` | graus de liberdade restantes |
| `g.units("mm")` | unidade de comprimento do projeto |
| `g.problem("planar" \| "axisymmetric", depth="100 mm")` | tipo de problema e profundidade (plano) |

## Malha — `m`

| Comando | Descrição |
|---|---|
| `m.material("Cobre", mur=1, sigma=58, br=0, color="#e0914f", bh=[(H, B), ...], kh=, alpha=, ke=, group=)` | cria ou edita um material (σ em MS/m, Br em T; `bh=None` apaga a curva) |
| `m.del_material(nome)`, `m.duplicate_material(nome)`, `m.restore_material(nome)` | apaga, duplica e restaura o padrão |
| `m.circuit("Bobina", current="10")` | cria ou edita um circuito |
| `m.del_circuit("Bobina")` | apaga |
| `m.region((x, y), name=, material=, circuit=, current=, turns=, angle=, label=(dx, dy))` | atribui à região que contém o ponto; devolve a área |
| `m.regions()` | lista `[((x, y), área, material)]` |
| `m.boundary_def("Nome", type=, value=, a1=, a2=, c0=, c1=, color=)` | cria ou edita um contorno |
| `m.boundary(["l1", "l2"], "Nome" \| "dirichlet" \| "neumann" \| "periodic" \| "antiperiodic" \| None)` | aplica um contorno às curvas |
| `m.mesh_size((x, y), "0.5 mm" \| "auto")` | tamanho do elemento na região |
| `m.curve_size([curvas], "1 mm")` | tamanho ao longo de curvas (`None` tira) |
| `m.settings("n1", size="2 mm" \| "auto", min_angle=30)` | tamanho padrão e qualidade da malha |
| `m.generate("n1")` | gera a malha |
| `m.add(name="Malha")`, `m.rename(id, nome)`, `m.remove(id)` | nós de malha |

Tipos de contorno em `type=`: `dirichlet` (A = value + a1·x + a2·y), `neumann`, `mixed` (c0, c1), `periodic`,
`antiperiodic`.

## Método de resolução — `s`

| Comando | Descrição |
|---|---|
| `s.add_physics(name="Campo magnético", circuit=False)` | nova física (campo, ou circuito com `circuit=True`) |
| `s.physics("n2", analysis="magnetostatic" \| "harmonic" \| "transient", frequency=, dt=, t_end=, schematic=)` | configura a análise (frequência em Hz, tempos em s) |
| `s.solve("n2")` | resolve (gera a malha antes, se preciso) |
| `s.rename(id, nome)`, `s.remove(id)` | organização |

## Resultados — `r`

| Comando | Descrição |
|---|---|
| `r.view("n2", name=)` | nova vista de campo |
| `r.interpolate("n2", level=3)` | vista interpolada (1 a 6) |
| `r.plot(vista, "surface" \| "contour" \| "arrow" \| "line", quantity="b" \| "h" \| "a" \| "j" \| "bn" \| "bt")` | camada numa vista (ou gráfico sobre linha) |
| `r.show(id, visible=, range=(0, 1.5), n_lines=20, spacing=, scale=, curve=, quantity=, color=, color_by_value=, colormap=, regions=[(x, y)], outputs=[("fx", "Fx")], var_name=, expr=, unit_label=, at_time=, legend=(x, y, s))` | opções de uma camada ou item |
| `r.table("n2", name=)` | nova tabela |
| `r.item(tabela, "circuits" \| "lineint" \| "surfint" \| "formula", name=)` | item de tabela |
| `r.move(camada, vista)`, `r.duplicate(id)`, `r.rename(id, nome)`, `r.remove(id)` | organização |
| `r.result("Fx", physics="n2")` | número de uma variável de resultado (no instante mostrado, no transitório) |
| `r.results("n2")` | lista `[(nome, valor, unidade), ...]` |
| `r.series("Bobina_I")` | transitório: `(tempos em s, valores)` |

Grandezas das integrais (para `outputs=`): superfície — `area`, `volume`, `intA`, `current`, `energy`, `bavg`,
`b2`, `loss`, `ironLoss`, `fx`, `fy`, `torque`; linha — `length`, `flux`, `mmf`, `intB`, `intBn`, `bavg`, `fx`,
`fy`, `torque`. Todas em SI.

## Esquemático — `c`

| Comando | Descrição |
|---|---|
| `c.add(name="Circuito 1")` | novo esquemático |
| `c.part(esq, "V" \| "I" \| "R" \| "L" \| "C" \| "gnd" \| "coil", x=, y=, rot=, value=, amp=, freq=, phase=, dc=, circuit=)` | componente |
| `c.wire(esq, (parte, terminal), (parte, terminal), mid=)` | fio entre terminais |
| `c.route(fio, x)` ou `c.route(fio, y=80)` | caminho do fio |
| `c.set(parte, value=, name=)`, `c.move(parte, (x, y))`, `c.rotate(parte)`, `c.remove(parte)` | edição |

## Globais

`help()`, `getid("nome")`, `undo()`, `redo()`, `fit()`, `reset()`. `clear()` e `next_id(n)` aparecem no script
exportado.
