const groups = {
  '1': 'Activo',
  '1.1': 'Activo corriente',
  '1.1.1': 'Caja y Bancos',
  '1.1.2': 'Créditos por ventas',
  '1.1.3': 'Otros créditos',
  '1.1.4': 'Bienes de cambio',
  '1.2': 'Activo no corriente',
  '1.2.1': 'Bienes de uso',
  '2': 'Pasivo',
  '2.1': 'Pasivo corriente',
  '2.1.1': 'Deudas comerciales',
  '2.1.2': 'Deudas financieras',
  '2.1.3': 'Deudas sociales',
  '2.1.4': 'Deudas fiscales',
  '2.2': 'Pasivo no corriente',
  '3': 'Patrimonio neto',
  '4': 'Resultados',
  '4.1': 'Ingresos',
  '4.2': 'Egresos'
};

const accounts = {
  '1.1.1': ['Caja en pesos', 'Cta. Cte. Banco A', 'Tarjeta', 'Cta. Cte. Banco Default', 'Cta. Cte. Banco Mercado Pago'],
  '1.1.2': ['Deudores por ventas', 'Valores a depositar', 'Cheques diferidos a cobrar', 'Cheques rechazados'],
  '1.1.3': ['Adelantos al personal', 'IVA saldo técnico a favor', 'IVA crédito fiscal', 'Retenciones IVA sufridas', 'Percepciones IVA sufridas', 'Retenciones y percepciones IIBB sufridas', 'Retenciones SUSS sufridas', 'IVA saldo libre disponibilidad', 'Retenciones de Ganancias sufridas', 'Régimen de recaudación SIRCREB', 'Crédito impuesto ley', 'Retenciones y percepciones impuesto global', 'Retenciones de Sellos sufridas', 'Tarjetas recaudadoras a cobrar'],
  '1.1.4': ['Mercaderías', 'Anticipos a proveedores'],
  '1.2.1': ['Inmuebles', 'Rodados', 'Maquinarias', 'Muebles y útiles', 'Amortización acumulada de rodados', 'Amortización acumulada de maquinarias', 'Amortización acumulada de muebles y útiles'],
  '2.1.1': ['Proveedores en cuenta corriente', 'Provisiones', 'Anticipo de clientes', 'Cheques diferidos a pagar'],
  '2.1.2': ['Préstamo Banco A a pagar', 'Tarjetas corporativas a pagar'],
  '2.1.3': ['Remuneraciones a pagar', 'Cargas sociales (SUSS) a pagar', 'Retenciones SUSS a pagar'],
  '2.1.4': ['Retenciones IVA a pagar', 'IVA débito fiscal', 'Impuesto a las Ganancias a pagar', 'Impuesto a los IIBB a pagar', 'Percepciones IVA a pagar', 'Percepciones IIBB a pagar'],
  '2.2': ['Deudas financieras'],
  '3': ['Capital social', 'Reserva legal', 'Resultados no asignados', 'Resultados del ejercicio', 'Ajuste de capital'],
  '4.1': ['Ventas', 'Ingresos por servicios', 'Conceptos no gravados por ventas', 'Ajuste de mercaderías positivo'],
  '4.2': ['Intereses', 'Descuentos', 'Costo de mercadería vendida', 'Costo de servicios', 'Sueldos', 'Cargas sociales', 'Honorarios', 'Impuestos y tasas', 'Mantenimiento y limpieza', 'Papelería y útiles de oficina', 'Viáticos y movilidad', 'Comunicaciones', 'Seguros', 'Seguridad', 'Energía eléctrica', 'Gas', 'Amortizaciones', 'Gastos bancarios', 'Impuestos débitos/créditos', 'Impuesto a las Ganancias', 'Gastos varios', 'Alquileres', 'Conceptos no gravados por compras', 'Otros gastos bancarios', 'Impuestos y sellos', 'Intereses bancarios', 'RECPAM', 'Comisiones', 'Diferencia de caja']
};

export const chart = [
  ...Object.entries(groups).map(([code, name]) => ({code, name, group: true})),
  ...Object.entries(accounts).flatMap(([prefix, names]) => names.map((name, i) => ({
    code: prefix + '.' + (i + 1), name, group: false
  }))),
  ...Object.entries({'1.1.5': 'Inversiones temporales', '4.3': 'Diferencia por tipo de cambio', '4.4': 'Ajuste de mercaderías negativo', '4.5': 'Descuentos recibidos'}).map(([code, name]) => ({code, name, group: false}))
];
