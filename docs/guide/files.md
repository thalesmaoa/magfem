# Arquivos, importar e exportar

## Projetos

O projeto é um arquivo **`.magfem`** (JSON) com o desenho, as variáveis, os materiais, a malha, as físicas e as
vistas. Os resultados são recalculados ao abrir.

- **Novo**, **Abrir**, **Salvar** e **Salvar como** ficam na barra superior.
- No Chrome e no Edge, **Salvar** regrava o mesmo arquivo, como num programa instalado; **Salvar como** escolhe
  outro. No Firefox e no Safari, salvar faz um download.
- Nada sai da sua máquina: não há servidor, conta nem nuvem.

## Rascunho e cópias automáticas

O projeto aberto é guardado no navegador (rascunho) a cada mudança: fechar a aba sem salvar não perde o trabalho.
Além disso, a cada minuto de edição a versão anterior vira uma **cópia automática** (até 10). Se o projeto abrir
vazio, uma faixa oferece recuperar a última cópia; a lista completa fica em **Cópias automáticas**. Recuperar pode
ser desfeito.

::: warning
O rascunho vive no armazenamento do navegador. Limpar os dados do site apaga o rascunho e as cópias. Salve os
projetos importantes em arquivo.
:::

## Importar

**Importar** aceita:

| Formato | O que entra |
|---|---|
| DXF | linhas, arcos, círculos e polilinhas; pontos coincidentes são unidos para as regiões fecharem |
| SVG | caminhos (com arcos) convertidos em linhas e arcos |
| FEMM (`.fem`) | geometria, materiais, contornos, circuitos e *block labels*. Regiões sem rótulo ficam fora da malha, e bordas sem propriedade ficam Neumann, como no FEMM |

Materiais do FEMM também estão em **Materiais › Importar do FEMM…** (lê o `matlib.dat`) e na busca da lista de
materiais.

## Exportar

O botão **Exportar** (barra superior) exporta o que está na aba ativa:

| Aba ativa | Formatos |
|---|---|
| Desenho | SVG (vetorial, em mm), DXF (LibreCAD, FreeCAD…), PNG, JPG |
| Vista de campo | PNG, JPG |
| Gráfico | SVG, PNG, JPG, CSV |
| Tabela | CSV |

Além disso:

| O quê | Onde |
|---|---|
| Animação (WebM) | barra da vista, no transitório e no AC |
| Modelo como código | botão `</>` ao lado de **Modelo**: script do console que recria o projeto |

O script exportado recria o modelo exatamente, com os mesmos ids. Ele é a base para
[automação](../scripting/console).
