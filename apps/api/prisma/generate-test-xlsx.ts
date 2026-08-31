import * as XLSX from 'xlsx';
import * as path from 'path';

const makes = ['Toyota', 'Nissan', 'Mercedes-Benz', 'BMW', 'Volkswagen', 'Ford', 'Isuzu', 'Land Rover', 'Mazda', 'Hyundai'];
const models: Record<string, string[]> = {
  Toyota: ['Hilux', 'Land Cruiser', 'Fortuner', 'Corolla', 'RAV4'],
  Nissan: ['Navara', 'Patrol', 'X-Trail', 'Hardbody'],
  'Mercedes-Benz': ['C200', 'E300', 'GLE400', 'Sprinter'],
  BMW: ['3 Series', '5 Series', 'X5', 'X3'],
  Volkswagen: ['Polo', 'Golf', 'Amarok', 'Tiguan'],
  Ford: ['Ranger', 'Everest', 'F150'],
  Isuzu: ['D-Max', 'MU-X'],
  'Land Rover': ['Discovery', 'Defender', 'Range Rover'],
  Mazda: ['CX-5', 'BT-50', 'Mazda3'],
  Hyundai: ['Tucson', 'Santa Fe', 'Creta'],
};
const colours = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Beige'];
const consultants = ['Theo', 'Chipo', 'Tinashe', 'Blessing'];
const statuses = ['Deposit paid', 'Purchased', 'Documents in progress', 'In transit', 'At border', 'Cleared', 'Ready for delivery'];
const destinations = ['Zimbabwe', 'Zambia', 'Botswana', 'Mozambique', 'Malawi'];
const cities = ['Harare', 'Bulawayo', 'Lusaka', 'Gaborone', 'Maputo', 'Blantyre'];

function randOf<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randYear() { return 2015 + Math.floor(Math.random() * 10); }
function randPrice() { return (Math.floor(Math.random() * 150) + 50) * 1000; }
function randPhone(i: number): string {
  const formats = [
    `+2637${String(i).padStart(8, '12')}`,
    `07${String(i % 100).padStart(2, '0')} ${String(i % 1000).padStart(3, '0')} ${String(i % 10000).padStart(4, '0')}`,
    `+27 82 ${String(i % 1000).padStart(3, '0')} ${String(i % 10000).padStart(4, '0')}`,
    `00263 77 ${String(i % 1000000).padStart(6, '0')}`,
    i % 7 === 0 ? '' : `+263${String(712000000 + i)}`, // every 7th is blank
  ];
  return randOf(formats);
}
function randDate(i: number): string {
  const formats = [
    `${String(10 + (i % 18)).padStart(2, '0')}/${String(1 + (i % 12)).padStart(2, '0')}/202${4 + (i % 2)}`,
    `${String(1 + (i % 12)).padStart(2, '0')}/${String(10 + (i % 18)).padStart(2, '0')}/202${4 + (i % 2)}`,
    `202${4 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(10 + (i % 18)).padStart(2, '0')}`,
    i % 9 === 0 ? 'March 2025' : '',
  ];
  return randOf(formats);
}
function randPriceStr(price: number, i: number): string {
  const formats = [
    `R${price.toLocaleString()}`,
    `R ${price}`,
    String(price),
    `${price.toLocaleString('en-ZA')}`,
    `ZAR ${price}`,
    i % 11 === 0 ? '' : `R${price}`,
  ];
  return randOf(formats);
}

const rows: Record<string, unknown>[] = [];
const names = [
  'Takudzwa Moyo', 'Rutendo Chikwanda', 'Farai Ndlovu', 'Simba Mutasa', 'Tendai Chirwa',
  'Grace Mupambi', 'Wellington Banda', 'Nyasha Dube', 'Chido Sithole', 'Arnold Ncube',
  'Princess Makoni', 'Tonderai Mwangi', 'Blessing Phiri', 'Memory Zulu', 'Douglas Sibanda',
  'Sharon Mokoena', 'Kudzai Nkosi', 'Amos Khumalo', 'Priscilla Malunga', 'Tariro Mthembu',
];

for (let i = 0; i < 50; i++) {
  const make = randOf(makes);
  const model = randOf(models[make]);
  const price = randPrice();
  const name = i < names.length ? names[i] : `${randOf(names).split(' ')[0]} ${randOf(names).split(' ')[1]}`;

  rows.push({
    'Customer Full Name': i === 14 ? '' : name, // row 14: missing name → NEEDS_REVIEW
    'Tel / WhatsApp': randPhone(i + 100),
    'Email': i % 5 === 0 ? `${name.split(' ')[0].toLowerCase()}@example.com` : '',
    'Vehicle Make': make,
    'Model': i === 22 ? '' : model, // row 22: missing model → NEEDS_REVIEW
    'Year Manufactured': i === 33 ? 'N/A' : randYear(), // row 33: bad year
    'Colour': randOf(colours),
    'VIN / Chassis': i % 4 === 0 ? `AAAJNK${String(i).padStart(11, '0')}` : '',
    'Reg No': i % 6 === 0 ? `${randOf(['CAA', 'BDA', 'HRE'])}${String(i).padStart(3, '0')}ZW` : '',
    'Asking Price (R)': randPriceStr(price, i),
    'Currency': i % 8 === 0 ? 'USD' : 'ZAR',
    'Destination': randOf(destinations),
    'Destination City': randOf(cities),
    'Supplier Name': `SA Dealer ${1 + (i % 10)}`,
    'Current Stage': i % 3 === 0 ? randOf(statuses) : '',
    'Consultant': i % 4 === 0 ? randOf(consultants) : '',
    'Date of Purchase': randDate(i),
  });
}

// Add 3 duplicate phone numbers to test client dedup
rows[5]['Tel / WhatsApp'] = rows[2]['Tel / WhatsApp'];
rows[10]['Tel / WhatsApp'] = rows[2]['Tel / WhatsApp'];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'Deals');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Note: 'Sheet2 — status reference' }]), 'Reference');

const outPath = path.join(__dirname, 'test-import.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Generated ${rows.length} rows → ${outPath}`);
