# Sprint garantías-desacopladas CP5 — Casos del modelo real

Validación de la compilación del motor F7 para los 5 casos del cuadro 3.2
del diseño aprobado + 1 caso mixto. **Este documento debe ser revisado por
un abogado del bufete antes de habilitar la generación de PDFs reales con
comparecientes y garantías del modelo nuevo.**

Cada caso muestra:
1. Bloque de comparecencia generado.
2. Cláusula de garantías generada.
3. Verificación de las 4 reglas de formato (R1-R4).

Generado por `backend/scripts/test-cp5-casos-modelo.js` el 2026-05-22.

---

## T1 · solo fiador (fiduciaria solidaria)

### Comparecencia

> En la ciudad de Ciudad de Guatemala el día primero de junio del año dos mil veintiséis, comparecen, por una parte, la entidad BANCO RSG, S.A., SOCIEDAD ANÓNIMA, debidamente representada por la señora LIC. ANA MARÍA RODRÍGUEZ SOTO, de cincuenta y uno (51) años de edad, casada, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil ochocientos setenta y seis espacio cincuenta y cuatro mil trescientos veintiuno espacio cero ciento uno (9876 54321 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de gerente general, lo que acredita mediante escritura pública de mandato número ochenta y ocho (88) de fecha quince de enero del año dos mil veintitrés autorizada por el notario Lic. Carlos Méndez a quien en lo sucesivo se denominará «EL ACREEDOR»; y por la otra parte, el señor CARLOS EDUARDO MENDEZ SOTO CP5, de treinta y nueve (39) años de edad, casado, guatemalteco, Ingeniero, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala a quien en lo sucesivo se denominará «EL DEUDOR»; y como comparecientes adicionales: el señor PEDRO PERALTA T1, de cuarenta y seis (46) años de edad, casado, guatemalteco, Comerciante, 5a 6-78 zona 2, quien se identifica con el Documento Personal de Identificación con código único de identificación siete mil setecientos setenta y siete espacio once mil ciento doce espacio dos mil doscientos veintitrés (7777 11112 2223) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de FIADOR. Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.

### Cláusula de Garantías

> Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, EL DEUDOR constituye a favor de EL ACREEDOR las siguientes garantías: fianza solidaria, mancomunada y de pago otorgada por PEDRO PERALTA T1.

### Verificación de reglas

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## T2 · cliente hipoteca (sin fiador)

### Comparecencia

> En la ciudad de Ciudad de Guatemala el día primero de junio del año dos mil veintiséis, comparecen, por una parte, la entidad BANCO RSG, S.A., SOCIEDAD ANÓNIMA, debidamente representada por la señora LIC. ANA MARÍA RODRÍGUEZ SOTO, de cincuenta y uno (51) años de edad, casada, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil ochocientos setenta y seis espacio cincuenta y cuatro mil trescientos veintiuno espacio cero ciento uno (9876 54321 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de gerente general, lo que acredita mediante escritura pública de mandato número ochenta y ocho (88) de fecha quince de enero del año dos mil veintitrés autorizada por el notario Lic. Carlos Méndez a quien en lo sucesivo se denominará «EL ACREEDOR»; y por la otra parte, el señor CARLOS EDUARDO MENDEZ SOTO CP5, de treinta y nueve (39) años de edad, casado, guatemalteco, Ingeniero, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala a quien en lo sucesivo se denominará «EL DEUDOR». Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.

### Cláusula de Garantías

> Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, EL DEUDOR constituye a favor de EL ACREEDOR las siguientes garantías: hipoteca de primer grado sobre el inmueble inscrito al número de finca doce mil trescientos cuarenta y cinco (12345), folio sesenta y siete (67), libro ocho (8) del General de la Propiedad, ubicado en 12 calle 8-45 zona 10, aportada por CARLOS EDUARDO MENDEZ SOTO CP5.

### Verificación de reglas

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## T3 · fiador + hipoteca cliente

### Comparecencia

> En la ciudad de Ciudad de Guatemala el día primero de junio del año dos mil veintiséis, comparecen, por una parte, la entidad BANCO RSG, S.A., SOCIEDAD ANÓNIMA, debidamente representada por la señora LIC. ANA MARÍA RODRÍGUEZ SOTO, de cincuenta y uno (51) años de edad, casada, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil ochocientos setenta y seis espacio cincuenta y cuatro mil trescientos veintiuno espacio cero ciento uno (9876 54321 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de gerente general, lo que acredita mediante escritura pública de mandato número ochenta y ocho (88) de fecha quince de enero del año dos mil veintitrés autorizada por el notario Lic. Carlos Méndez a quien en lo sucesivo se denominará «EL ACREEDOR»; y por la otra parte, el señor CARLOS EDUARDO MENDEZ SOTO CP5, de treinta y nueve (39) años de edad, casado, guatemalteco, Ingeniero, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala a quien en lo sucesivo se denominará «EL DEUDOR»; y como comparecientes adicionales: el señor JUAN GARCIA T3, de cuarenta (40) años de edad, soltero, guatemalteco, Médico, 3a 4-50 zona 14, quien se identifica con el Documento Personal de Identificación con código único de identificación ocho mil ochocientos ochenta y ocho espacio veintidós mil doscientos veintitrés espacio tres mil trescientos treinta y cuatro (8888 22223 3334) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de FIADOR. Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.

### Cláusula de Garantías

> Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, EL DEUDOR constituye a favor de EL ACREEDOR las siguientes garantías: fianza solidaria, mancomunada y de pago otorgada por JUAN GARCIA T3; e hipoteca de primer grado sobre el inmueble inscrito al número de finca quinientos cincuenta y cinco (555), folio doce (12), libro tres (3) del General de la Propiedad, ubicado en 12 calle 8-45 zona 10, aportada por CARLOS EDUARDO MENDEZ SOTO CP5.

### Verificación de reglas

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## T4 · fiador-que-hipoteca

### Comparecencia

> En la ciudad de Ciudad de Guatemala el día primero de junio del año dos mil veintiséis, comparecen, por una parte, la entidad BANCO RSG, S.A., SOCIEDAD ANÓNIMA, debidamente representada por la señora LIC. ANA MARÍA RODRÍGUEZ SOTO, de cincuenta y uno (51) años de edad, casada, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil ochocientos setenta y seis espacio cincuenta y cuatro mil trescientos veintiuno espacio cero ciento uno (9876 54321 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de gerente general, lo que acredita mediante escritura pública de mandato número ochenta y ocho (88) de fecha quince de enero del año dos mil veintitrés autorizada por el notario Lic. Carlos Méndez a quien en lo sucesivo se denominará «EL ACREEDOR»; y por la otra parte, el señor CARLOS EDUARDO MENDEZ SOTO CP5, de treinta y nueve (39) años de edad, casado, guatemalteco, Ingeniero, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala a quien en lo sucesivo se denominará «EL DEUDOR»; y como comparecientes adicionales: la señora MARIA LOPEZ T4, de treinta y cinco (35) años de edad, casada, guatemalteca, Arquitecta, 6a 7-89 zona 9, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil novecientos noventa y nueve espacio treinta y tres mil trescientos treinta y cuatro espacio cuatro mil cuatrocientos cuarenta y cinco (9999 33334 4445) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de FIADOR. Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.

### Cláusula de Garantías

> Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, EL DEUDOR constituye a favor de EL ACREEDOR las siguientes garantías: fianza solidaria, mancomunada y de pago otorgada por MARIA LOPEZ T4; e hipoteca de primer grado sobre el inmueble inscrito al número de finca ochocientos ochenta y ocho (888), folio veintidós (22), libro cuatro (4) del General de la Propiedad, ubicado en 6a avenida 7-89 zona 9, aportada por MARIA LOPEZ T4.

### Verificación de reglas

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## T5 · tercero garante hipoteca (sin fiador)

### Comparecencia

> En la ciudad de Ciudad de Guatemala el día primero de junio del año dos mil veintiséis, comparecen, por una parte, la entidad BANCO RSG, S.A., SOCIEDAD ANÓNIMA, debidamente representada por la señora LIC. ANA MARÍA RODRÍGUEZ SOTO, de cincuenta y uno (51) años de edad, casada, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil ochocientos setenta y seis espacio cincuenta y cuatro mil trescientos veintiuno espacio cero ciento uno (9876 54321 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de gerente general, lo que acredita mediante escritura pública de mandato número ochenta y ocho (88) de fecha quince de enero del año dos mil veintitrés autorizada por el notario Lic. Carlos Méndez a quien en lo sucesivo se denominará «EL ACREEDOR»; y por la otra parte, el señor CARLOS EDUARDO MENDEZ SOTO CP5, de treinta y nueve (39) años de edad, casado, guatemalteco, Ingeniero, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala a quien en lo sucesivo se denominará «EL DEUDOR»; y como comparecientes adicionales: el señor ROBERTO MENDOZA T5, de cincuenta y seis (56) años de edad, casado, guatemalteco, Empresario, 8a 9-10 zona 4, quien se identifica con el Documento Personal de Identificación con código único de identificación mil diez espacio cuarenta y cuatro mil cuatrocientos cuarenta y cinco espacio cinco mil quinientos cincuenta y seis (1010 44445 5556) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de TERCERO GARANTE. Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.

### Cláusula de Garantías

> Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, EL DEUDOR constituye a favor de EL ACREEDOR las siguientes garantías: hipoteca de primer grado sobre el inmueble inscrito al número de finca novecientos noventa y nueve (999), folio treinta y tres (33), libro cinco (5) del General de la Propiedad, ubicado en 8a avenida 9-10 zona 4, aportada por ROBERTO MENDOZA T5.

### Verificación de reglas

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## T6 · mixta (2 fiadores + hipoteca cliente + prenda tercero)

### Comparecencia

> En la ciudad de Ciudad de Guatemala el día primero de junio del año dos mil veintiséis, comparecen, por una parte, la entidad BANCO RSG, S.A., SOCIEDAD ANÓNIMA, debidamente representada por la señora LIC. ANA MARÍA RODRÍGUEZ SOTO, de cincuenta y uno (51) años de edad, casada, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil ochocientos setenta y seis espacio cincuenta y cuatro mil trescientos veintiuno espacio cero ciento uno (9876 54321 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala, quien actúa en su calidad de gerente general, lo que acredita mediante escritura pública de mandato número ochenta y ocho (88) de fecha quince de enero del año dos mil veintitrés autorizada por el notario Lic. Carlos Méndez a quien en lo sucesivo se denominará «EL ACREEDOR»; y por la otra parte, el señor CARLOS EDUARDO MENDEZ SOTO CP5, de treinta y nueve (39) años de edad, casado, guatemalteco, Ingeniero, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala a quien en lo sucesivo se denominará «EL DEUDOR»; y como comparecientes adicionales: el señor ANDRES SOLIS T6A, de treinta y siete (37) años de edad, soltero, guatemalteco, Contador, 1a 2-3 zona 1, quien se identifica con el Documento Personal de Identificación con código único de identificación mil ciento once espacio cincuenta y cinco mil quinientos cincuenta y seis espacio seis mil seiscientos sesenta y siete (1111 55556 6667) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de FIADOR; la señora BEATRIZ TORRES T6B, de cuarenta y cuatro (44) años de edad, casada, guatemalteca, Abogada, 2a 3-4 zona 1, quien se identifica con el Documento Personal de Identificación con código único de identificación dos mil doscientos veintidós espacio sesenta y seis mil seiscientos sesenta y siete espacio siete mil setecientos setenta y ocho (2222 66667 7778) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de FIADOR; el señor CESAR DIAZ T6C, de cincuenta (50) años de edad, casado, guatemalteco, Empresario, 3a 4-5 zona 1, quien se identifica con el Documento Personal de Identificación con código único de identificación tres mil trescientos treinta y tres espacio setenta y siete mil setecientos setenta y ocho espacio ocho mil ochocientos ochenta y nueve (3333 77778 8889) extendido por el Registro Nacional de las Personas de la República de Guatemala, en calidad de TERCERO GARANTE. Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.

### Cláusula de Garantías

> Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, EL DEUDOR constituye a favor de EL ACREEDOR las siguientes garantías: fianza solidaria, mancomunada y de pago otorgada por ANDRES SOLIS T6A y BEATRIZ TORRES T6B; hipoteca de primer grado sobre el inmueble inscrito al número de finca mil cien (1100), folio cuarenta y cuatro (44), libro seis (6) del General de la Propiedad, ubicado en 12 calle 8-45 zona 10, aportada por CARLOS EDUARDO MENDEZ SOTO CP5; e prenda sin desplazamiento sobre vehículo automotor, marca Toyota, modelo Hilux 2024, serie ABC123XYZ456, placa P-987-XYZ, aportada por CESAR DIAZ T6C.

### Verificación de reglas

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## Pendiente de validación legal

Para que el motor F7 con el modelo nuevo (comparecientes + aportantes
separados) sea apto para producción, un abogado del bufete debe confirmar:

1. **Frase del tercero garante**: el texto generado cuando un compareciente
   con rol `tercero_garante` aporta una hipoteca/prenda — ¿es legalmente
   correcto en Guatemala? (ver T5 y T6 arriba).
2. **Frase del fiador que además hipoteca**: el caso T4 donde una sola
   persona figura como fiador Y como aportante de una hipoteca propia.
3. **Comparecencia con múltiples comparecientes**: el texto del bloque
   `{{comparecencia}}` con N comparecientes (ver T6) — ¿la enumeración
   y los participios (FIADOR / TERCERO GARANTE) están bien?
4. **Compatibilidad con tipos de modelo legacy**: hoy el motor genera el
   mismo bloque para cualquier `modelos.tipo_garantia` (personal/
   hipotecaria/prendaria/mixta) — ¿corresponde adaptar el texto a cada
   tipo?
