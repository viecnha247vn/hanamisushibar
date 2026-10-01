// Menyändringar som förs in i Google Sheet automatiskt när webbplatsen byggs (produktion).
// Varje ändring körs bara en gång – ge nya ändringar ett nytt id och lägg dem sist i listan.
// Rör bara det som står här; det köket själv ändrat i arket lämnas i fred.
//   set:   { id: { name, price, desc, visible } }   ändra en rad
//   add:   [{ after, id, name, price, desc }]        ny rad direkt efter raden "after"
//   hide:  [id]                                     bocka ur "Visas på webben"
//   notes: { kategori-id: "text" }                  kategoritext (tom rad = nytt stycke)
//   cats:  { kategori-id: { name } }                kategorinamn
export default [
  {
    "id": "2026-09-21-meny",
    "set": {
      "barn-1": {
        "name": "Doraemon sushi"
      },
      "barn-2": {
        "name": "Conan karaage"
      },
      "bubble-1": {
        "name": "Classic milk tea",
        "price": 69,
        "desc": ""
      },
      "bubble-2": {
        "name": "Taro milk tea",
        "price": 69,
        "desc": ""
      },
      "bubble-3": {
        "name": "Matcha milk tea",
        "price": 69,
        "desc": ""
      },
      "nigiri-1": {
        "desc": "Riskudde med valbar topping: lax, tonfisk, avokado, krabbstick, jätteräka, tofu, wakame eller krabbröra. Välj sort och antal."
      },
      "nigiri-2": {
        "desc": "Flamberad lax eller flamberad jätteräka. Välj sort och antal."
      }
    },
    "hide": [
      "bubble-4"
    ],
    "add": [
      {
        "after": "tillbehor-10",
        "id": "tillbehor-22",
        "name": "Kycklinggyoza, 2 st",
        "price": 32
      },
      {
        "after": "tillbehor-22",
        "id": "tillbehor-23",
        "name": "Chicken katsu, 1 st",
        "price": 60
      },
      {
        "after": "tillbehor-23",
        "id": "tillbehor-24",
        "name": "Tempura ebi, 2 st",
        "price": 35
      }
    ],
    "notes": {
      "bubble": "Njut av vår Bubble Tea med tapiokapärlor och 1 valfri popping boba – ingår!\nVälj mellan Classic, Matcha eller Taro.\n\nPopping boba: Mango, jordgubb, blåbär eller lychee.\n\nVill du ha extra topping? +10 kr/st."
    }
  },
  {
    "id": "2026-09-23-meny",
    "cats": { "sushi": { "name": "Sushi mix" } },
    "set": {
      "maki-7": { "desc": "Välj mellan lax, avokado eller gurka" },
      "maki-8": { "desc": "Välj mellan lax, avokado eller gurka" }
    }
  }
];
