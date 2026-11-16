// Cor de cada dispositivo: é dado (quem gerou o bloco), não decoração.
// Saturação média, variada de propósito para não virar "tudo verde".
const DEVICE_COLORS = ['#5B8DEF', '#E8894A', '#4FB3A9', '#D9B44A', '#D46A92', '#9A7FE0', '#C46A4F', '#8FA7B8', '#7FB35B', '#E07A7A', '#3FA0C9', '#B98ACF'];
function deviceColor(index) { return DEVICE_COLORS[index % DEVICE_COLORS.length]; }
