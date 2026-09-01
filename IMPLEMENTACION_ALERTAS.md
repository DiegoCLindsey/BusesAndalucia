# Implementación: Sistema de Alertas Horarias y Redesign de Paradas

## FASE 1: Redesign de Vista de Paradas y Horarios

### 1.1 Paradas Circulares Conectadas
**Cambios en `renderLineDetail`:**
- Usar estructura: Cabecera → circulito → (opcional: parada expandida) → Destino
- Mostrar paradas como círculos numerados (1, 2, 3...) conectados por línea vertical
- Colapsar por defecto (mostrar "..." entre cabecera y destino)
- Expandir si parada es favorita o es la parada seleccionada por defecto
- Click en círculo → expande esa parada

**Nuevos estilos CSS:**
```css
.stops-visual-path { /* contenedor principal */
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 16px 0;
}

.stop-circle { /* círculo de parada */
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  background: var(--surface-strong);
  color: var(--text);
  cursor: pointer;
  flex-shrink: 0;
}

.stop-circle:hover {
  background: var(--brand);
  color: var(--brand-ink);
}

.stop-connector {
  width: 2px;
  height: 16px;
  background: var(--hairline);
  margin-left: 15px;
}

.stops-collapsed-indicator {
  font-size: 12px;
  color: var(--text-mute);
  margin: 4px 0 4px 8px;
}
```

### 1.2 Horarios Formato Horizontal
**Cambios en `renderHorarioSection`:**
- Mostrar formato: `HH` (color acento) + `mm` (color secundario)
- Cada hora/minuto es clickeable para alertas
- Agrupar por día de forma visual clara

**Nuevos estilos CSS:**
```css
.horario-horizontal {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
}

.horario-cell {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 6px 10px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.horario-cell:hover {
  background: var(--brand);
  color: var(--brand-ink);
}

.horario-hora {
  font-weight: 700;
  font-size: 16px;
  color: var(--brand);
}

.horario-minuto {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-soft);
}

.horario-cell:hover .horario-hora,
.horario-cell:hover .horario-minuto {
  color: var(--brand-ink);
}
```

## FASE 2: Sistema de Alertas (Notificaciones por Horario)

### 2.1 Estructura de Datos
```javascript
// Almacenamiento en localStorage: 'app_horarios_alertas'
{
  alertas: [
    {
      id: "uuid-1234",
      stopId: "1_2106",
      lineSlug: "m-177",
      time: "08:43",  // HH:mm
      dayPattern: "weekday" | "saturday" | "sunday" | "custom",
      customDays: [1, 2, 3, 4, 5], // ISO: 1=lunes, 7=domingo (si custom)
      enabled: true,
      createdAt: 1234567890,
      lastTriggered: 1234567890 | null,
      seasonMarker: "2024-06" // año-mes para detectar cambios
    }
  ]
}
```

### 2.2 Modal de Selector de Alertas
- Botón "Activar alerta" en cada hora clickeada
- Modal con:
  - Confirmación de parada/línea/hora
  - Selector de días: "Entre semana (L-V)" | "Sábados" | "Domingos/Festivos" | "Personalizado"
  - Si personalizado: selector checkbox LMXJV
  - Botón "Activar alerta"

### 2.3 Gestión de Alertas
**Funciones nuevas:**
- `crearAlerta(stopId, lineSlug, time, dayPattern, customDays?)`
- `eliminarAlerta(alertaId)`
- `actualizarAlerta(alertaId, ...)`
- `obtenerAlertasDeParada(stopId)`
- `verificarAlertasHoy()` - devuelve alertas que aplican hoy
- `detectarCambioTemporada()` - compara seasonMarker actual

## FASE 3: Vista "Mis Avisos"

### 3.1 Nueva Tab/Vista
- Accesible desde home o como modal
- Lista de todas las alertas activas
- Cada alerta muestra:
  - Parada, Línea, Hora
  - Días en que aplica (etiqueta legible)
  - Botón eliminar
  - Toggle activar/desactivar

### 3.2 Notificaciones de Cambios
- Si alerta no aplica hoy: mostrar badge "⚠️ No disponible hoy"
- Opción para "Ver alternativas" o "Eliminar alerta"

## FASE 4: Service Worker y Background Sync

### 4.1 Polling en SW
- Ejecutar cada 30 minutos (o cuando app se abre)
- Verificar alertas del día actual
- Si hay alertas activas: enviar notificación

### 4.2 Notificaciones
- Formato: "M-177 a las 8:43 desde Av Andalucía"
- Con badge, sound, vibrate
- Click abre modal de parada

## Archivos a Modificar

- `index.html`: Nuevas funciones, estilos, modales
- `sw.js`: Polling y notificaciones
- `tests/inicio.mjs`: Tests para alertas (opcional)

## Hitos de Implementación

1. ✅ Crear plan detallado
2. ⬜ Fase 1: Paradas circulares + horarios horizontales
3. ⬜ Fase 2: Sistema de alertas (UI + persistencia)
4. ⬜ Fase 3: Vista "Mis avisos"
5. ⬜ Fase 4: Background sync
6. ⬜ Testing y refinamiento
7. ⬜ Merge y deploy

## Estimación de Tiempo

- Fase 1: 2-3 horas
- Fase 2: 2-3 horas  
- Fase 3: 1 hora
- Fase 4: 1-2 horas
- Total: 6-9 horas
