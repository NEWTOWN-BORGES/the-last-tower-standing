#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import os
from PIL import Image, ImageDraw, ImageFont
import sys

# Carregar dados
with open('taticos_temp.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# Cores por tipo de tática
colors = {
    'Equipamento': {'bg': (180, 140, 80), 'border': (200, 160, 100), 'text': (255, 240, 200)},
    'Magia': {'bg': (100, 120, 200), 'border': (150, 180, 255), 'text': (220, 240, 255)},
    'Consumível': {'bg': (150, 100, 150), 'border': (200, 150, 200), 'text': (240, 200, 255)},
    'Construção': {'bg': (120, 100, 80), 'border': (180, 150, 100), 'text': (230, 210, 180)},
    'Clima': {'bg': (80, 150, 180), 'border': (120, 200, 230), 'text': (200, 240, 255)},
    'Bênção': {'bg': (180, 160, 100), 'border': (220, 200, 150), 'text': (255, 250, 220)}
}

# Símbolo por tipo
symbols = {
    'Equipamento': '⚔',
    'Magia': '✦',
    'Consumível': '◆',
    'Construção': '■',
    'Clima': '≈',
    'Bênção': '❖'
}

# Cores por facção (para barra lateral)
faction_colors = {
    'reinos': (200, 150, 80),
    'coro': (200, 200, 150),
    'verdemanto': (100, 180, 100),
    'semceu': (120, 80, 180),
    'despertos': (200, 100, 150)
}

os.makedirs('assets/taticos-3d', exist_ok=True)

for i, card in enumerate(cards):
    width, height = 750, 1050
    img = Image.new('RGB', (width, height), (40, 40, 50))
    draw = ImageDraw.Draw(img)

    tipo = card['tipo_tatico']
    faccao_slug = card['faccao_slug']

    # Cores
    color_scheme = colors.get(tipo, colors['Equipamento'])
    faction_color = faction_colors.get(faccao_slug, (100, 100, 100))

    # Fundo com gradiente simulado (retângulos de cor decrescente)
    for y in range(0, height, 50):
        fade = y / height
        r = int(color_scheme['bg'][0] * (1 - fade * 0.3))
        g = int(color_scheme['bg'][1] * (1 - fade * 0.3))
        b = int(color_scheme['bg'][2] * (1 - fade * 0.3))
        draw.rectangle((0, y, width, y + 50), fill=(r, g, b))

    # Moldura (borda espessa)
    border_width = 8
    draw.rectangle((border_width, border_width, width - border_width, height - border_width),
                   outline=color_scheme['border'], width=border_width)

    # Barra lateral (facção)
    side_width = 60
    draw.rectangle((width - side_width, 0, width, height), fill=faction_color)

    # Tenta carregar fonte (fallback para default se não existir)
    try:
        title_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 42)
        text_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28)
        small_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)
    except:
        title_font = ImageFont.load_default()
        text_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # Nome (topo)
    name_y = 60
    draw.text((width // 2, name_y), card['nome'], fill=color_scheme['text'], font=title_font, anchor='mm')

    # Tipo e símbolo (centro-alto)
    symbol = symbols.get(tipo, '?')
    draw.text((width // 2, name_y + 120), symbol, fill=color_scheme['text'], font=title_font, anchor='mm')

    # Tipo em texto (abaixo do símbolo)
    draw.text((width // 2, name_y + 180), tipo, fill=color_scheme['text'], font=text_font, anchor='mm')

    # Subfacção (meio)
    draw.text((width // 2, height // 2), card['subfaccao'], fill=color_scheme['text'], font=text_font, anchor='mm')

    # Descrição (abaixo)
    efeito = card['efeito_descricao']
    # Quebra de linha simples se for muito longo
    if len(efeito) > 40:
        words = efeito.split()
        lines = []
        current_line = []
        for word in words:
            current_line.append(word)
            if len(' '.join(current_line)) > 35:
                lines.append(' '.join(current_line[:-1]))
                current_line = [word]
        lines.append(' '.join(current_line))
    else:
        lines = [efeito]

    desc_y = height // 2 + 150
    for line in lines[:3]:  # máx 3 linhas
        draw.text((width // 2, desc_y), line, fill=(200, 200, 200), font=small_font, anchor='mm')
        desc_y += 40

    # Custo (rodapé)
    draw.text((width // 2, height - 80), f"Custo: {card['custo']}", fill=(200, 200, 200), font=text_font, anchor='mm')

    # Guardar
    filename = f"assets/taticos-3d/{card['imagem']}"
    img.save(filename)

    if (i + 1) % 50 == 0:
        print(f"Geradas {i + 1}/300 imagens...")

print(f"Concluído! 300 imagens geradas em assets/taticos-3d/")
