# Resultados

Depois de resolver, a física aparece em **Resultados** com o |B| máximo. O `+` dela cria vistas, gráficos e
tabelas; cada um abre como uma **aba** no canvas (a aba **Desenho** continua lá).

## Vistas de campo

| Item | O que mostra |
|---|---|
| Mapa de campo | superfície colorida (|B|, |H|, A, J), contorno de A (as **linhas de fluxo**) e glifos (setas dos vetores) |
| Mapa interpolado | o mesmo com interpolação de alta ordem e subdivisão: contornos suaves |
| Gráfico sobre linha | uma grandeza ao longo de uma curva do desenho (B, Bn, Bt, H, A…) |

Uma vista tem **camadas** (superfície, contorno, setas), que podem ser ocultadas, duplicadas e arrastadas na
árvore para outra vista. Nas propriedades da camada: grandeza, faixa de valores, número de linhas, mapa de cores,
cor e espaçamento das setas.

- Clique na **legenda** para mudar os limites; arraste para mover e use a alça do canto para redimensionar.
- **Exportar** (barra superior) gera PNG ou JPG da vista.

![Mapa de |B| com linhas de fluxo](/img/field-pt.png){.shot}

## Tabelas e variáveis de resultado

Uma **Tabela** reúne itens, e cada item gera **variáveis de resultado** com nome, que podem ser lidas por scripts
(`r.result("nome")`).

| Item | Resultados |
|---|---|
| Circuitos | corrente, espiras, fluxo concatenado λ, L = λ/I, R CC, V CC e perdas I²R de cada circuito |
| Integral de superfície | nas regiões escolhidas: área, volume, ∫A, corrente, energia, B médio, perdas (Joule e ferro), **força Fx, Fy e torque** |
| Integral sobre linha | sobre uma curva: comprimento, fluxo Φ, força magnetomotriz ∫H·dl, ∫B, B médio, **força e torque** (contorno fechado) |
| Fórmula | uma expressão sobre as outras variáveis (por exemplo `0.5*Bobina_L*Bobina_I^2`) |

Cada saída tem um nome editável (o padrão é o prefixo do item mais a grandeza, como `S1_fx`). As variáveis de
circuito se chamam `<circuito>_I`, `<circuito>_lambda`, `<circuito>_L` e `<circuito>_R`.

![Tabela de circuitos](/img/table-pt.png){.shot}

## Força e torque

A força é calculada pelo **tensor de Maxwell**, de dois jeitos:

- **Integral de superfície** (recomendada): selecione as regiões do corpo. Usa o tensor ponderado, como o *block
  integral* do FEMM, e só os elementos de ar em volta do corpo contribuem. É a mais precisa.
- **Integral sobre linha**: um contorno fechado no ar em volta do corpo.

O torque é em torno da origem. No plano, os valores já incluem a profundidade.

## Transitório e AC

Na análise transitória e na AC, a barra da vista tem uma **barra de tempo**, ▶ para animar, quadros por segundo e
**Exportar animação (WebM)**. Os itens de tabela viram **curvas no tempo**; nas propriedades do item dá para ver a
tabela num instante escolhido. Os sinais de um circuito externo aparecem ao clicar num componente.

## Exportar

O botão **Exportar** da barra superior exporta a aba ativa: vista de campo em PNG ou JPG, gráfico em SVG, PNG, JPG
ou CSV, e tabela em CSV. A animação (WebM) sai pela barra da vista. Veja
[Arquivos, importar e exportar](./files#exportar).
