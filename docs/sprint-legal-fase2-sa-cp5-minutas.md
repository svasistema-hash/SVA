# Sprint LexDocs Legal Fase 2 — CP5 Reporte de minutas

Compilación verbatim del motor F7 (sociedad-engine.js) para los 5 escenarios
representativos de constitución de Sociedad Anónima. **Este documento debe ser
revisado por un notario senior antes de habilitar la generación de PDFs reales en
producción** (bloqueador P0-2 de la sección 3.8 del CP1).

Cada escenario muestra:
1. Datos de entrada del caso.
2. Las 9 cláusulas compiladas verbatim por el motor.
3. Verificación de las 4 reglas de formato (R1-R4) del motor F7.

Generado por `backend/scripts/test-fase2-sa-cp5-minutas.js` el 2026-06-03.

---

## E1 · 1 accionista (mínimo legal)

### Datos de entrada

- **Denominación**: TECNOLOGÍAS DEL VALLE, Sociedad Anónima
- **Estado al compilar**: listo_para_RM (snapshot inmutable)
- **Correlativo**: SA-CP5-2026-0001
- **Accionistas (1)**:
  - CARLOS EDUARDO MÉNDEZ SOTO — 100 acciones (100%)
- **Representantes (1)**:
  - CARLOS EDUARDO MÉNDEZ SOTO — Administrador Único

### Minuta compilada (9 cláusulas)

#### COMPARECENCIA

> En la ciudad de Guatemala el día primero de junio del año dos mil veintiséis, ante mí, LIC. ROBERTO CASTILLO ALDANA, Notario Colegiado número ocho mil setecientos sesenta y cinco (8765), comparecen los señores: el señor CARLOS EDUARDO MÉNDEZ SOTO, de treinta y nueve (39) años de edad, casado, guatemalteca, Ingeniero, 12 calle 8-45 zona 10, quien se identifica con el Documento Personal de Identificación con código único de identificación mil doscientos treinta y cuatro espacio cincuenta y seis mil setecientos ochenta y nueve espacio cero ciento veintitrés (1234 56789 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala, quienes me solicitan la protocolización del presente instrumento mediante el cual constituyen una Sociedad Anónima conforme a las disposiciones del Código de Comercio de la República de Guatemala.

#### PRIMERA — Denominación y Forma

> Se constituye una sociedad mercantil bajo la denominación social TECNOLOGÍAS DEL VALLE, SOCIEDAD ANÓNIMA, la cual se regirá por las disposiciones del Código de Comercio de la República de Guatemala, las contenidas en la presente escritura y los estatutos sociales que en este acto se aprueban.

#### SEGUNDA — Objeto Social

> El objeto social de la sociedad será: El desarrollo, comercialización y mantenimiento de software, así como la prestación de servicios de consultoría tecnológica.. La sociedad podrá realizar todas las actividades conexas, complementarias y accesorias que resulten necesarias para el cumplimiento de su objeto social, incluyendo la celebración de toda clase de contratos lícitos y la realización de cualquier otra actividad mercantil no prohibida por las leyes de la República de Guatemala.

#### TERCERA — Plazo

> El plazo de duración de la sociedad será de noventa y nueve (99) años, contados a partir del primero de junio del año dos mil veintiséis, prorrogable por acuerdo de la Asamblea General Extraordinaria de Accionistas conforme a los estatutos.

#### CUARTA — Domicilio

> El domicilio legal de la sociedad será el municipio de Guatemala del departamento de Guatemala, Guatemala, sin perjuicio de poder establecer agencias, sucursales o representaciones en cualquier otro lugar del territorio nacional o del extranjero mediante acuerdo del órgano de administración competente.

#### QUINTA — Capital Social y Acciones

> El capital social de la sociedad asciende a la suma de cinco mil quetzales exactos (Q5,000.00), dividido y representado por cien (100) acciones nominativas con un valor nominal de cincuenta quetzales exactos (Q50.00) cada una. El capital social se encuentra íntegramente suscrito y pagado por los accionistas en la siguiente forma: El señor CARLOS EDUARDO MÉNDEZ SOTO suscribe y paga cien (100) acciones, equivalentes al cien por ciento (100%) del capital social.

#### SEXTA — Administración

> La administración, dirección y representación legal de la sociedad estará a cargo del órgano de administración designado en este acto. El cargo de ADMINISTRADOR ÚNICO recae en el señor CARLOS EDUARDO MÉNDEZ SOTO, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio.

#### SÉPTIMA — Disposiciones Generales

> Las asambleas generales de accionistas, ordinarias y extraordinarias, se regirán por lo dispuesto en el Código de Comercio y los estatutos sociales. El ejercicio social comenzará el primero de enero y concluirá el treinta y uno de diciembre de cada año. Las utilidades líquidas y las pérdidas se distribuirán entre los accionistas en proporción a sus aportaciones. La disolución y liquidación de la sociedad se sujetarán a las causales y procedimientos establecidos en el Código de Comercio.

#### OCTAVA — Aceptación y Firma

> Los comparecientes manifiestan que han leído íntegramente el presente instrumento, que conocen y aceptan sus efectos jurídicos, y en señal de conformidad firman junto al notario autorizante en el lugar y fecha indicados en la comparecencia.

### Verificación de reglas de formato

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## E2 · 2 accionistas 50/50 + 2 representantes

### Datos de entrada

- **Denominación**: CONSULTORÍA JURÍDICA INTEGRAL, Sociedad Anónima
- **Estado al compilar**: listo_para_RM (snapshot inmutable)
- **Correlativo**: SA-CP5-2026-0002
- **Accionistas (2)**:
  - JUAN PÉREZ GONZÁLEZ — 100 acciones (50%)
  - ANA MARÍA LÓPEZ CASTILLO — 100 acciones (50%)
- **Representantes (2)**:
  - JUAN PÉREZ GONZÁLEZ — Presidente
  - ANA MARÍA LÓPEZ CASTILLO — Vicepresidente

### Minuta compilada (9 cláusulas)

#### COMPARECENCIA

> En la ciudad de Guatemala el día primero de junio del año dos mil veintiséis, ante mí, LIC. ROBERTO CASTILLO ALDANA, Notario Colegiado número ocho mil setecientos sesenta y cinco (8765), comparecen los señores: el señor JUAN PÉREZ GONZÁLEZ, de cuarenta y seis (46) años de edad, casado, guatemalteca, Abogado, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación dos mil doscientos veintidós espacio veintidós mil doscientos veintidós espacio cero ciento veintitrés (2222 22222 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala; la señora ANA MARÍA LÓPEZ CASTILLO, de cuarenta y uno (41) años de edad, soltera, guatemalteca, Abogada y Notaria, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación tres mil trescientos treinta y tres espacio treinta y tres mil trescientos treinta y tres espacio cero ciento veintitrés (3333 33333 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala, quienes me solicitan la protocolización del presente instrumento mediante el cual constituyen una Sociedad Anónima conforme a las disposiciones del Código de Comercio de la República de Guatemala.

#### PRIMERA — Denominación y Forma

> Se constituye una sociedad mercantil bajo la denominación social CONSULTORÍA JURÍDICA INTEGRAL, SOCIEDAD ANÓNIMA, la cual se regirá por las disposiciones del Código de Comercio de la República de Guatemala, las contenidas en la presente escritura y los estatutos sociales que en este acto se aprueban.

#### SEGUNDA — Objeto Social

> El objeto social de la sociedad será: La prestación de servicios profesionales en materia de asesoría legal corporativa, registro mercantil, propiedad intelectual y cumplimiento normativo.. La sociedad podrá realizar todas las actividades conexas, complementarias y accesorias que resulten necesarias para el cumplimiento de su objeto social, incluyendo la celebración de toda clase de contratos lícitos y la realización de cualquier otra actividad mercantil no prohibida por las leyes de la República de Guatemala.

#### TERCERA — Plazo

> El plazo de duración de la sociedad será de noventa y nueve (99) años, contados a partir del primero de junio del año dos mil veintiséis, prorrogable por acuerdo de la Asamblea General Extraordinaria de Accionistas conforme a los estatutos.

#### CUARTA — Domicilio

> El domicilio legal de la sociedad será el municipio de Guatemala del departamento de Guatemala, Guatemala, sin perjuicio de poder establecer agencias, sucursales o representaciones en cualquier otro lugar del territorio nacional o del extranjero mediante acuerdo del órgano de administración competente.

#### QUINTA — Capital Social y Acciones

> El capital social de la sociedad asciende a la suma de veinte mil quetzales exactos (Q20,000.00), dividido y representado por doscientos (200) acciones nominativas con un valor nominal de cien quetzales exactos (Q100.00) cada una. El capital social se encuentra íntegramente suscrito y pagado por los accionistas en la siguiente forma: El señor JUAN PÉREZ GONZÁLEZ suscribe y paga cien (100) acciones, equivalentes al cincuenta por ciento (50%) del capital social; y La señora ANA MARÍA LÓPEZ CASTILLO suscribe y paga cien (100) acciones, equivalentes al cincuenta por ciento (50%) del capital social.

#### SEXTA — Administración

> La administración, dirección y representación legal de la sociedad estará a cargo del órgano de administración designado en este acto. El cargo de PRESIDENTE recae en el señor JUAN PÉREZ GONZÁLEZ, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio. El cargo de VICEPRESIDENTE recae en la señora ANA MARÍA LÓPEZ CASTILLO, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio.

#### SÉPTIMA — Disposiciones Generales

> Las asambleas generales de accionistas, ordinarias y extraordinarias, se regirán por lo dispuesto en el Código de Comercio y los estatutos sociales. El ejercicio social comenzará el primero de enero y concluirá el treinta y uno de diciembre de cada año. Las utilidades líquidas y las pérdidas se distribuirán entre los accionistas en proporción a sus aportaciones. La disolución y liquidación de la sociedad se sujetarán a las causales y procedimientos establecidos en el Código de Comercio.

#### OCTAVA — Aceptación y Firma

> Los comparecientes manifiestan que han leído íntegramente el presente instrumento, que conocen y aceptan sus efectos jurídicos, y en señal de conformidad firman junto al notario autorizante en el lugar y fecha indicados en la comparecencia.

### Verificación de reglas de formato

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## E3 · 3 accionistas 60/25/15 + Gerente General único

### Datos de entrada

- **Denominación**: INVERSIONES PARETO, Sociedad Anónima
- **Estado al compilar**: listo_para_RM (snapshot inmutable)
- **Correlativo**: SA-CP5-2026-0003
- **Accionistas (3)**:
  - ROBERTO ALEJANDRO RAMÍREZ TORRES — 600 acciones (60%)
  - PATRICIA ELENA MORALES SANDOVAL — 250 acciones (25%)
  - JOSÉ FERNANDO CASTAÑEDA RUIZ — 150 acciones (15%)
- **Representantes (1)**:
  - ROBERTO ALEJANDRO RAMÍREZ TORRES — Gerente General

### Minuta compilada (9 cláusulas)

#### COMPARECENCIA

> En la ciudad de Guatemala el día primero de junio del año dos mil veintiséis, ante mí, LIC. ROBERTO CASTILLO ALDANA, Notario Colegiado número ocho mil setecientos sesenta y cinco (8765), comparecen los señores: el señor ROBERTO ALEJANDRO RAMÍREZ TORRES, de cincuenta (50) años de edad, casado, guatemalteca, Empresario, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación cuatro mil cuatrocientos cuarenta y cuatro espacio cuarenta y cuatro mil cuatrocientos cuarenta y cuatro espacio cero ciento veintitrés (4444 44444 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala; la señora PATRICIA ELENA MORALES SANDOVAL, de cuarenta y tres (43) años de edad, casada, guatemalteca, Administradora de Empresas, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación cinco mil quinientos cincuenta y cinco espacio cincuenta y cinco mil quinientos cincuenta y cinco espacio cero ciento veintitrés (5555 55555 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala; el señor JOSÉ FERNANDO CASTAÑEDA RUIZ, de treinta y seis (36) años de edad, soltero, guatemalteca, Contador Público, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación seis mil seiscientos sesenta y seis espacio sesenta y seis mil seiscientos sesenta y seis espacio cero ciento veintitrés (6666 66666 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala, quienes me solicitan la protocolización del presente instrumento mediante el cual constituyen una Sociedad Anónima conforme a las disposiciones del Código de Comercio de la República de Guatemala.

#### PRIMERA — Denominación y Forma

> Se constituye una sociedad mercantil bajo la denominación social INVERSIONES PARETO, SOCIEDAD ANÓNIMA, la cual se regirá por las disposiciones del Código de Comercio de la República de Guatemala, las contenidas en la presente escritura y los estatutos sociales que en este acto se aprueban.

#### SEGUNDA — Objeto Social

> El objeto social de la sociedad será: La realización de inversiones de capital, gestión de carteras, asesoría financiera estratégica y administración de activos para clientes corporativos e individuales.. La sociedad podrá realizar todas las actividades conexas, complementarias y accesorias que resulten necesarias para el cumplimiento de su objeto social, incluyendo la celebración de toda clase de contratos lícitos y la realización de cualquier otra actividad mercantil no prohibida por las leyes de la República de Guatemala.

#### TERCERA — Plazo

> El plazo de duración de la sociedad será de noventa y nueve (99) años, contados a partir del primero de junio del año dos mil veintiséis, prorrogable por acuerdo de la Asamblea General Extraordinaria de Accionistas conforme a los estatutos.

#### CUARTA — Domicilio

> El domicilio legal de la sociedad será el municipio de Guatemala del departamento de Guatemala, Guatemala, sin perjuicio de poder establecer agencias, sucursales o representaciones en cualquier otro lugar del territorio nacional o del extranjero mediante acuerdo del órgano de administración competente.

#### QUINTA — Capital Social y Acciones

> El capital social de la sociedad asciende a la suma de cien mil quetzales exactos (Q100,000.00), dividido y representado por mil (1000) acciones nominativas con un valor nominal de cien quetzales exactos (Q100.00) cada una. El capital social se encuentra íntegramente suscrito y pagado por los accionistas en la siguiente forma: El señor ROBERTO ALEJANDRO RAMÍREZ TORRES suscribe y paga seiscientos (600) acciones, equivalentes al sesenta por ciento (60%) del capital social; La señora PATRICIA ELENA MORALES SANDOVAL suscribe y paga doscientos cincuenta (250) acciones, equivalentes al veinticinco por ciento (25%) del capital social; y El señor JOSÉ FERNANDO CASTAÑEDA RUIZ suscribe y paga ciento cincuenta (150) acciones, equivalentes al quince por ciento (15%) del capital social.

#### SEXTA — Administración

> La administración, dirección y representación legal de la sociedad estará a cargo del órgano de administración designado en este acto. El cargo de GERENTE GENERAL recae en el señor ROBERTO ALEJANDRO RAMÍREZ TORRES, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio.

#### SÉPTIMA — Disposiciones Generales

> Las asambleas generales de accionistas, ordinarias y extraordinarias, se regirán por lo dispuesto en el Código de Comercio y los estatutos sociales. El ejercicio social comenzará el primero de enero y concluirá el treinta y uno de diciembre de cada año. Las utilidades líquidas y las pérdidas se distribuirán entre los accionistas en proporción a sus aportaciones. La disolución y liquidación de la sociedad se sujetarán a las causales y procedimientos establecidos en el Código de Comercio.

#### OCTAVA — Aceptación y Firma

> Los comparecientes manifiestan que han leído íntegramente el presente instrumento, que conocen y aceptan sus efectos jurídicos, y en señal de conformidad firman junto al notario autorizante en el lugar y fecha indicados en la comparecencia.

### Verificación de reglas de formato

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## E4 · accionista único + Administrador Único con facultades amplias

### Datos de entrada

- **Denominación**: COMERCIALIZADORA DEL NORTE, Sociedad Anónima
- **Estado al compilar**: listo_para_RM (snapshot inmutable)
- **Correlativo**: SA-CP5-2026-0004
- **Accionistas (1)**:
  - MARÍA FERNANDA SOLÍS HERRERA — 300 acciones (100%)
- **Representantes (1)**:
  - MARÍA FERNANDA SOLÍS HERRERA — Administrador Único

### Minuta compilada (9 cláusulas)

#### COMPARECENCIA

> En la ciudad de Quetzaltenango el día primero de junio del año dos mil veintiséis, ante mí, LIC. ROBERTO CASTILLO ALDANA, Notario Colegiado número ocho mil setecientos sesenta y cinco (8765), comparecen los señores: la señora MARÍA FERNANDA SOLÍS HERRERA, de treinta y ocho (38) años de edad, casada, guatemalteca, Comerciante, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación siete mil setecientos setenta y siete espacio setenta y siete mil setecientos setenta y siete espacio cero ciento veintitrés (7777 77777 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala, quienes me solicitan la protocolización del presente instrumento mediante el cual constituyen una Sociedad Anónima conforme a las disposiciones del Código de Comercio de la República de Guatemala.

#### PRIMERA — Denominación y Forma

> Se constituye una sociedad mercantil bajo la denominación social COMERCIALIZADORA DEL NORTE, SOCIEDAD ANÓNIMA, la cual se regirá por las disposiciones del Código de Comercio de la República de Guatemala, las contenidas en la presente escritura y los estatutos sociales que en este acto se aprueban.

#### SEGUNDA — Objeto Social

> El objeto social de la sociedad será: La importación, distribución y comercialización al por mayor y al por menor de productos de consumo masivo, materia prima y bienes terminados en el mercado nacional.. La sociedad podrá realizar todas las actividades conexas, complementarias y accesorias que resulten necesarias para el cumplimiento de su objeto social, incluyendo la celebración de toda clase de contratos lícitos y la realización de cualquier otra actividad mercantil no prohibida por las leyes de la República de Guatemala.

#### TERCERA — Plazo

> El plazo de duración de la sociedad será de noventa y nueve (99) años, contados a partir del primero de junio del año dos mil veintiséis, prorrogable por acuerdo de la Asamblea General Extraordinaria de Accionistas conforme a los estatutos.

#### CUARTA — Domicilio

> El domicilio legal de la sociedad será el municipio de Quetzaltenango del departamento de Quetzaltenango, Guatemala, sin perjuicio de poder establecer agencias, sucursales o representaciones en cualquier otro lugar del territorio nacional o del extranjero mediante acuerdo del órgano de administración competente.

#### QUINTA — Capital Social y Acciones

> El capital social de la sociedad asciende a la suma de quince mil quetzales exactos (Q15,000.00), dividido y representado por trescientos (300) acciones nominativas con un valor nominal de cincuenta quetzales exactos (Q50.00) cada una. El capital social se encuentra íntegramente suscrito y pagado por los accionistas en la siguiente forma: La señora MARÍA FERNANDA SOLÍS HERRERA suscribe y paga trescientos (300) acciones, equivalentes al cien por ciento (100%) del capital social.

#### SEXTA — Administración

> La administración, dirección y representación legal de la sociedad estará a cargo del órgano de administración designado en este acto. El cargo de ADMINISTRADOR ÚNICO recae en la señora MARÍA FERNANDA SOLÍS HERRERA, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las siguientes facultades: Las amplias facultades del mandatario general con representación judicial y administrativa, incluyendo las que requieren cláusula especial conforme al artículo mil seiscientos noventa y dos del Código Civil.

#### SÉPTIMA — Disposiciones Generales

> Las asambleas generales de accionistas, ordinarias y extraordinarias, se regirán por lo dispuesto en el Código de Comercio y los estatutos sociales. El ejercicio social comenzará el primero de enero y concluirá el treinta y uno de diciembre de cada año. Las utilidades líquidas y las pérdidas se distribuirán entre los accionistas en proporción a sus aportaciones. La disolución y liquidación de la sociedad se sujetarán a las causales y procedimientos establecidos en el Código de Comercio.

#### OCTAVA — Aceptación y Firma

> Los comparecientes manifiestan que han leído íntegramente el presente instrumento, que conocen y aceptan sus efectos jurídicos, y en señal de conformidad firman junto al notario autorizante en el lugar y fecha indicados en la comparecencia.

### Verificación de reglas de formato

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## E5 · 3 representantes Presidente / Vicepresidente / Secretario

### Datos de entrada

- **Denominación**: CORPORATIVO MULTI SECTOR, Sociedad Anónima
- **Estado al compilar**: listo_para_RM (snapshot inmutable)
- **Correlativo**: SA-CP5-2026-0005
- **Accionistas (2)**:
  - DIEGO ARMANDO SANDOVAL PÉREZ — 300 acciones (60%)
  - LAURA CRISTINA AGUILAR VÁSQUEZ — 200 acciones (40%)
- **Representantes (3)**:
  - DIEGO ARMANDO SANDOVAL PÉREZ — Presidente
  - LAURA CRISTINA AGUILAR VÁSQUEZ — Vicepresidente
  - FERNANDO ESTEBAN ROMERO LÓPEZ — Secretario

### Minuta compilada (9 cláusulas)

#### COMPARECENCIA

> En la ciudad de Guatemala el día primero de junio del año dos mil veintiséis, ante mí, LIC. ROBERTO CASTILLO ALDANA, Notario Colegiado número ocho mil setecientos sesenta y cinco (8765), comparecen los señores: el señor DIEGO ARMANDO SANDOVAL PÉREZ, de cincuenta y cinco (55) años de edad, casado, guatemalteca, Administrador de Empresas, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación ocho mil ochocientos ochenta y ocho espacio ochenta y ocho mil ochocientos ochenta y ocho espacio cero ciento veintitrés (8888 88888 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala; la señora LAURA CRISTINA AGUILAR VÁSQUEZ, de cuarenta y siete (47) años de edad, casada, guatemalteca, Abogada, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación nueve mil novecientos noventa y nueve espacio noventa y nueve mil novecientos noventa y nueve espacio cero ciento veintitrés (9999 99999 0123) extendido por el Registro Nacional de las Personas de la República de Guatemala, quienes me solicitan la protocolización del presente instrumento mediante el cual constituyen una Sociedad Anónima conforme a las disposiciones del Código de Comercio de la República de Guatemala.

#### PRIMERA — Denominación y Forma

> Se constituye una sociedad mercantil bajo la denominación social CORPORATIVO MULTI SECTOR, SOCIEDAD ANÓNIMA, la cual se regirá por las disposiciones del Código de Comercio de la República de Guatemala, las contenidas en la presente escritura y los estatutos sociales que en este acto se aprueban.

#### SEGUNDA — Objeto Social

> El objeto social de la sociedad será: La administración corporativa de empresas en diversos sectores económicos, prestación de servicios de consultoría administrativa, financiera, comercial y operativa.. La sociedad podrá realizar todas las actividades conexas, complementarias y accesorias que resulten necesarias para el cumplimiento de su objeto social, incluyendo la celebración de toda clase de contratos lícitos y la realización de cualquier otra actividad mercantil no prohibida por las leyes de la República de Guatemala.

#### TERCERA — Plazo

> El plazo de duración de la sociedad será de noventa y nueve (99) años, contados a partir del primero de junio del año dos mil veintiséis, prorrogable por acuerdo de la Asamblea General Extraordinaria de Accionistas conforme a los estatutos.

#### CUARTA — Domicilio

> El domicilio legal de la sociedad será el municipio de Guatemala del departamento de Guatemala, Guatemala, sin perjuicio de poder establecer agencias, sucursales o representaciones en cualquier otro lugar del territorio nacional o del extranjero mediante acuerdo del órgano de administración competente.

#### QUINTA — Capital Social y Acciones

> El capital social de la sociedad asciende a la suma de cincuenta mil quetzales exactos (Q50,000.00), dividido y representado por quinientos (500) acciones nominativas con un valor nominal de cien quetzales exactos (Q100.00) cada una. El capital social se encuentra íntegramente suscrito y pagado por los accionistas en la siguiente forma: El señor DIEGO ARMANDO SANDOVAL PÉREZ suscribe y paga trescientos (300) acciones, equivalentes al sesenta por ciento (60%) del capital social; y La señora LAURA CRISTINA AGUILAR VÁSQUEZ suscribe y paga doscientos (200) acciones, equivalentes al cuarenta por ciento (40%) del capital social.

#### SEXTA — Administración

> La administración, dirección y representación legal de la sociedad estará a cargo del órgano de administración designado en este acto. El cargo de PRESIDENTE recae en el señor DIEGO ARMANDO SANDOVAL PÉREZ, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio. El cargo de VICEPRESIDENTE recae en la señora LAURA CRISTINA AGUILAR VÁSQUEZ, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio. El cargo de SECRETARIO recae en el señor FERNANDO ESTEBAN ROMERO LÓPEZ, con vigencia desde el primero de junio del año dos mil veintiséis por tiempo indefinido, con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio.

#### SÉPTIMA — Disposiciones Generales

> Las asambleas generales de accionistas, ordinarias y extraordinarias, se regirán por lo dispuesto en el Código de Comercio y los estatutos sociales. El ejercicio social comenzará el primero de enero y concluirá el treinta y uno de diciembre de cada año. Las utilidades líquidas y las pérdidas se distribuirán entre los accionistas en proporción a sus aportaciones. La disolución y liquidación de la sociedad se sujetarán a las causales y procedimientos establecidos en el Código de Comercio.

#### OCTAVA — Aceptación y Firma

> Los comparecientes manifiestan que han leído íntegramente el presente instrumento, que conocen y aceptan sus efectos jurídicos, y en señal de conformidad firman junto al notario autorizante en el lugar y fecha indicados en la comparecencia.

### Verificación de reglas de formato

- **R1** (sin `{{var}}` sin resolver): ✓ OK
- **R2** (cero números en cifra sola): ✓ OK
- **R3** (fechas/días en formato legal): ✓ OK
- **R4** (sin `__MISSING__` ni `[VAR]`): ✓ OK

---

## Pendiente de validación legal

Para que el motor F7 con el modelo de Sociedad Anónima sea apto para producción,
un notario senior debe confirmar:

1. **Frase de comparecencia** (cláusula 1): el formato notarial con la enumeración
   de accionistas comparecientes, el notario autorizante, fecha y ciudad.
2. **Denominación y forma** (cláusula 2): el agregado "Sociedad Anónima" al final
   y el lenguaje de regencia por el Código de Comercio.
3. **Objeto social** (cláusula 3): el preámbulo legal y la mención de actividades
   conexas, complementarias y accesorias.
4. **Plazo** (cláusula 4): la fórmula con prorroga por Asamblea Extraordinaria.
5. **Domicilio** (cláusula 5): la mención de poder establecer agencias o sucursales.
6. **Capital y acciones** (cláusula 6): la frase de "íntegramente suscrito y pagado"
   y la descripción de la distribución entre los accionistas.
7. **Administración** (cláusula 7): la mención de "facultades inherentes al cargo
   conforme a los estatutos y al Código de Comercio".
8. **Disposiciones generales** (cláusula 8): la mención del ejercicio social del
   primero de enero al treinta y uno de diciembre, distribución proporcional de
   utilidades y referencia genérica al Código de Comercio para disolución.
9. **Aceptación y firma** (cláusula 9): la fórmula final de lectura y aceptación.

Cualquier modificación al texto generado debe codificarse en
`backend/sociedad-engine.js` (constante `CLAUSULAS_BASE`) y validarse nuevamente
corriendo `npm run test:fase2-sa-cp5`.
