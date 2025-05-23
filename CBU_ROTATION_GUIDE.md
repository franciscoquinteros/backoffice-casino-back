# Guía del Sistema de Rotación de CBUs

## Descripción

El sistema de rotación de CBUs permite distribuir automáticamente las transacciones entre múltiples cuentas bancarias de MercadoPago basándose en un criterio de `accumulated_amount`. Esto asegura que no se sobrecargue una sola cuenta y se distribuya el volumen de transacciones.

## Cómo Funciona

### Criterio de Rotación

1. **Límite por cuenta**: Cada cuenta puede acumular hasta **100 pesos** antes de rotar a la siguiente
2. **Selección automática**: Siempre se selecciona la cuenta con el menor `accumulated_amount` que no haya alcanzado el límite
3. **Reset automático**: Cuando todas las cuentas alcanzan el límite, se resetean todas a 0 y se reinicia el ciclo

### Flujo de Funcionamiento

1. **Solicitud de CBU**: Cuando se necesita un CBU, el sistema busca la cuenta con menor `accumulated_amount` < 100
2. **Transacción aprobada**: Al aprobar una transacción, se suma el monto al `accumulated_amount` de esa cuenta
3. **Verificación de límite**: Si la cuenta alcanza ≥100, se marca como "llena" y no será seleccionada hasta el reset
4. **Rotación completa**: Cuando todas las cuentas están llenas, se resetean todas y se reinicia desde la cuenta con ID menor

## Endpoints Disponibles

### 1. Obtener CBU por Rotación

```http
GET /accounts/cbu?idAgent=office123
```

**Parámetros:**
- `idAgent` (required): ID de la oficina

**Respuesta:**
```json
{
  "cbu": "1234567890123456789012"
}
```

### 2. Estado de Rotación

```http
GET /accounts/cbu/rotation-status?idAgent=office123
```

**Parámetros:**
- `idAgent` (optional): ID de la oficina (si no se proporciona, muestra todas)

**Respuesta:**
```json
{
  "status": "success",
  "total_accounts": 5,
  "accounts_below_limit": 3,
  "accounts_at_limit": 2,
  "max_limit": 100,
  "next_available_cbu": "1234567890123456789012",
  "accounts": [
    {
      "id": 1,
      "name": "Cuenta Principal",
      "cbu": "1234567890123456789012",
      "accumulated_amount": 45.50,
      "is_available": true
    },
    {
      "id": 2,
      "name": "Cuenta Secundaria",
      "cbu": "2345678901234567890123",
      "accumulated_amount": 78.20,
      "is_available": true
    },
    {
      "id": 3,
      "name": "Cuenta Auxiliar",
      "cbu": "3456789012345678901234",
      "accumulated_amount": 100.00,
      "is_available": false
    }
  ]
}
```

### 3. Reset Manual de Rotación

```http
POST /accounts/cbu/reset-rotation?idAgent=office123
```

**Autorización**: Requiere JWT token (solo admins y superadmins)

**Parámetros:**
- `idAgent` (optional): ID de la oficina

**Respuesta:**
```json
{
  "status": "success",
  "message": "CBU rotation reset successfully for office office123",
  "accounts_reset": 5
}
```

## Logs y Monitoreo

El sistema genera logs detallados para facilitar el monitoreo:

```
[AccountService] Seleccionado CBU 1234567890123456789012 (Cuenta: Cuenta Principal, ID: 1, Acumulado: 45.50)
[AccountService] Monto acumulado actualizado para CBU 1234567890123456789012. Anterior: 45.50, Nuevo: 95.50
[AccountService] Todas las cuentas superan el límite. Reseteando todas las cuentas y empezando desde la primera.
```

## Consideraciones Técnicas

### Base de Datos

La columna `accumulated_amount` en la tabla `account`:
- Tipo: `DECIMAL(10,2)`
- Valor por defecto: `0`
- Se actualiza automáticamente al aprobar transacciones

### Orden de Selección

1. **Primario**: `accumulated_amount` ascendente
2. **Secundario**: `id` ascendente (para consistencia en casos de empate)

### Actualización Automática

El `accumulated_amount` se actualiza automáticamente en estos casos:
- Transacciones IPN de MercadoPago aprobadas
- Transacciones manuales aceptadas por administradores
- Validaciones automáticas de depósitos

## Casos de Uso

### Ejemplo 1: Sistema Nuevo
```
Cuentas: A(0), B(0), C(0)
Solicitud CBU: Selecciona A → A queda seleccionada
Transacción aprobada (50): A(50), B(0), C(0)
Siguiente solicitud: Selecciona B → B queda seleccionada
```

### Ejemplo 2: Rotación Normal
```
Cuentas: A(95), B(80), C(60)
Solicitud CBU: Selecciona C (menor acumulado) → C queda seleccionada
```

### Ejemplo 3: Alcance de Límite
```
Cuentas: A(95), B(80), C(60)
Solicitud CBU: Selecciona C → C queda seleccionada
Transacción aprobada (30): A(95), B(80), C(90)
Siguiente solicitud: Selecciona B (menor acumulado disponible)
```

### Ejemplo 4: Reset Automático
```
Cuentas: A(100), B(105), C(98)
Solicitud CBU: Selecciona C → C queda seleccionada
Transacción aprobada (5): A(100), B(105), C(103)
Siguiente solicitud: Todas ≥100 → Reset automático → A(0), B(0), C(0) → Selecciona A
```

## Mantenimiento

### Verificar Estado
Usar el endpoint `/accounts/cbu/rotation-status` para monitorear el estado de las cuentas.

### Reset Manual
Los administradores pueden usar `/accounts/cbu/reset-rotation` para reiniciar el ciclo manualmente.

### Agregar/Remover Cuentas
Al agregar o remover cuentas de MercadoPago activas, el sistema automáticamente las incluye/excluye del ciclo de rotación.

## Seguridad

- Los endpoints de reset requieren autenticación JWT
- Los administradores solo pueden resetear las cuentas de su oficina
- Los superadmins pueden resetear cualquier oficina
- El sistema valida que las cuentas pertenezcan a la oficina especificada

## Integración con el Sistema Existente

El endpoint `/accounts/cbu?idAgent=` ahora utiliza automáticamente la nueva lógica de rotación:

- **Antes**: Devolvía cualquier CBU activo de la oficina
- **Ahora**: Devuelve el CBU de la cuenta con menor `accumulated_amount` que no haya alcanzado el límite

Esto significa que **no se requieren cambios en el código cliente** que ya usa este endpoint. La rotación se aplica automáticamente de forma transparente. 