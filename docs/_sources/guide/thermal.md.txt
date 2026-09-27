# Térmica (regime)

A física **Térmica** calcula a temperatura em regime permanente a partir das perdas de uma física magnética (AC ou
magnetostática). O ar não é simulado como escoamento (sem CFD): ele fica fora do domínio térmico, e as superfícies
expostas trocam calor por **convecção**. Um **ventilador** entra como um canal de ar que renova o ar e esquenta com o
calor que leva.

## Como usar

1. Resolva (ou prepare) uma física magnética **AC** ou **magnetostática** com as correntes de trabalho.
2. No `+` de **Método de resolução**, crie **Térmica (regime)** e escolha em **Perdas de** a física magnética.
3. Ajuste a **temperatura ambiente**, a **convecção** das superfícies e, no plano, as **faces frente/trás**.
4. Resolva (▶). Em **Resultados › Térmica**, crie um **Mapa de campo**: superfície de temperatura e isotermas (contorno).

Os materiais precisam da **condutividade térmica k**; os da biblioteca já têm (cobre 400, alumínio 237, aço M400 28,
aço 1010 50 W/m·K). Sem k, vale um valor típico do grupo. Chapas laminadas conduzem $f\cdot k$ no plano do desenho.

## Resfriamento

| Onde | O que é | Valores típicos |
|---|---|---|
| Superfícies expostas | convecção $h\,(T - T_{amb})$ em toda borda do sólido que toca o ar | natural 5–10, ventilado 25–100 W/m²·K |
| Faces frente/trás (plano) | o 2D não vê as faces da profundidade: $2h/\text{profundidade}$ por volume | igual à convecção natural |
| Condição em curvas | convecção com outro $h$, temperatura fixa ou isolada, só nas curvas escolhidas | — |
| Canal de ar (ventilador) | vazão $Q$ (m³/h) e temperatura de entrada; as curvas ligadas trocam calor com o ar do canal | — |

Para aplicar uma condição a curvas: selecione as curvas no desenho e clique em **Usar as curvas selecionadas** na
condição.

## Ventilador (canal de ar)

O ar renovado leva o calor das curvas ligadas ao canal. Com vazão $Q$, $\dot m = \rho_{ar} Q$:

$$
T_{saída} = T_{entrada} + \frac{P}{\dot m\, c_p}, \qquad T_{ar} = \frac{T_{entrada} + T_{saída}}{2},
$$

e a convecção dessas curvas usa $T_{ar}$. Temperatura e ar são resolvidos juntos por iteração: pouca vazão → o ar
esquenta → resfria menos.

## Resistividade com a temperatura

Com **Resistividade com a temperatura** ligado, a resistividade dos condutores segue
$\rho(T) = \rho_{20}\,[1 + \alpha\,(T - 20)]$ ($\alpha$ = 0,00393/K no cobre). As perdas nas bobinas são recalculadas
com a temperatura de cada região, e os **condutores maciços** (correntes parasitas) têm o AC resolvido de novo com o
$\sigma$ corrigido. A iteração para quando a temperatura das regiões muda menos de 0,1 K (normalmente 3 a 5 voltas).

## Resultados

| Variável | O quê |
|---|---|
| `Tmax`, `Tmin` | temperaturas máxima e mínima (°C) |
| `<região>_Tavg`, `<região>_Tmax` | média e máxima por região |
| `P_perdas`, `P_dissipado` | perdas totais e calor que sai (devem ser iguais: balanço) |
| `<canal>_Tar`, `<canal>_Tsaida`, `<canal>_P` | ar médio, saída e calor levado por canal |

## Limitações

- Regime permanente. A elevação adiabática em curto-circuito (sem tempo para o calor sair) e o transitório térmico
  são os próximos passos.
- O ar não é simulado: a convecção vem do $h$ informado. Em canais longos, o ar esquenta ao longo do caminho; o modelo
  usa a média entre entrada e saída.
