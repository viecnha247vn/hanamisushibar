// Reservmeny: används bara om Google Sheet inte går att nå vid bygget.
// Den riktiga menyn redigeras i fliken "Meny" i Google Sheet.
export default [
  {
    "id": "lunch",
    "name": "Lunchmeny",
    "note": "Måndag–fredag 11:00–14:00. Dryck och misosoppa ingår.",
    "items": [
      {
        "id": "lunch-1",
        "name": "10 bitar sushi mix",
        "price": 120
      },
      {
        "id": "lunch-2",
        "name": "12 bitar sushi mix",
        "price": 135
      },
      {
        "id": "lunch-3",
        "name": "Vegansk poke bowl",
        "price": 130
      },
      {
        "id": "lunch-4",
        "name": "Bowl med lax",
        "price": 140
      },
      {
        "id": "lunch-5",
        "name": "Bowl med räkor",
        "price": 140
      },
      {
        "id": "lunch-6",
        "name": "Bowl med tempuraräkor",
        "price": 150
      },
      {
        "id": "lunch-7",
        "name": "Bowl med crunchy chicken",
        "price": 150
      },
      {
        "id": "lunch-8",
        "name": "Bowl med biff (yakiniku)",
        "price": 150
      },
      {
        "id": "lunch-9",
        "name": "Kycklingspett",
        "price": 139
      },
      {
        "id": "lunch-10",
        "name": "Hanami bento",
        "price": 155
      }
    ]
  },
  {
    "id": "happy",
    "name": "Happy hour",
    "note": "Varje öppen dag 16:00–17:00. Ej byte av bitar. Vid köp över 450 kr ingår en påse räkchips så länge lagret räcker.",
    "items": [
      {
        "id": "happy-1",
        "name": "Sushi mix 30",
        "price": 365,
        "desc": "30 bitar: 3 lax, 2 jätteräkor, 2 krabbstick, 2 avokado, 1 tofu, 20 maki (kockens val)"
      },
      {
        "id": "happy-2",
        "name": "Sushi mix 40",
        "price": 489,
        "desc": "40 bitar: 6 lax, 3 jätteräkor, 2 krabbstick, 2 avokado, 2 tofu, 25 maki (kockens val)"
      },
      {
        "id": "happy-3",
        "name": "Sushi mix 50",
        "price": 599,
        "desc": "50 bitar: 9 lax, 4 jätteräkor, 2 krabbstick, 3 avokado, 2 tofu, 30 maki (kockens val)"
      }
    ]
  },
  {
    "id": "nigiri",
    "name": "Nigiri",
    "items": [
      {
        "id": "nigiri-1",
        "name": "Nigiri",
        "price": 19,
        "desc": "Riskudde med valbar topping: lax, tonfisk, avokado, krabbstick, jätteräka, tofu, wakame eller krabbröra. Välj sort och antal."
      },
      {
        "id": "nigiri-2",
        "name": "Special nigiri",
        "price": 23,
        "desc": "Flamberad lax eller flamberad jätteräka. Välj sort och antal."
      },
      {
        "id": "nigiri-3",
        "name": "Nigiri mix 10",
        "price": 185,
        "desc": "Välj dina 10 egna"
      },
      {
        "id": "nigiri-4",
        "name": "Nigiri mix 12",
        "price": 205,
        "desc": "Välj dina 12 egna"
      }
    ]
  },
  {
    "id": "sushi",
    "name": "Sushi",
    "items": [
      {
        "id": "sushi-1",
        "name": "Sushi mix 8",
        "price": 129,
        "desc": "1 lax, 1 jätteräka, 1 avokado, 5 maki (kockens val)"
      },
      {
        "id": "sushi-2",
        "name": "Sushi mix 10",
        "price": 149,
        "desc": "2 lax, 1 jätteräka, 1 avokado, 1 krabbstick, 5 maki (kockens val)"
      },
      {
        "id": "sushi-3",
        "name": "Sushi mix 12",
        "price": 169,
        "desc": "3 lax, 2 jätteräkor, 2 avokado, 5 maki (kockens val)"
      },
      {
        "id": "sushi-4",
        "name": "Sushi mix 15",
        "price": 205,
        "desc": "3 lax, 2 jätteräkor, 1 tonfisk, 2 avokado, 2 krabbstick, 5 maki (kockens val)"
      },
      {
        "id": "sushi-5",
        "name": "Sushi mix 20",
        "price": 299,
        "desc": "3 lax, 2 jätteräkor, 1 tonfisk, 2 avokado, 2 krabbstick, 10 maki (kockens val)"
      },
      {
        "id": "sushi-6",
        "name": "Sushi mix 30",
        "price": 409,
        "desc": "3 lax, 2 jätteräkor, 2 krabbstick, 2 avokado, 1 tonfisk, 20 maki (kockens val)"
      },
      {
        "id": "sushi-7",
        "name": "Sushi mix 40",
        "price": 545,
        "desc": "6 lax, 3 jätteräkor, 2 krabbstick, 2 avokado, 2 tonfisk, 25 maki (kockens val)"
      },
      {
        "id": "sushi-8",
        "name": "Sushi mix 50",
        "price": 679,
        "desc": "9 lax, 4 jätteräkor, 2 krabbstick, 3 avokado, 2 tonfisk, 30 maki (kockens val)"
      },
      {
        "id": "sushi-9",
        "name": "Mamma mix",
        "price": 149,
        "desc": "10 bitar: 2 jätteräkor, 2 avokado, 1 krabbstick, 5 maki (kockens val)"
      },
      {
        "id": "sushi-10",
        "name": "Vegan mix",
        "price": 149,
        "desc": "10 bitar: 3 avokado, 3 tofu, 4 veggi maki"
      }
    ]
  },
  {
    "id": "maki",
    "name": "Maki",
    "note": "En rulle är 10 bitar.",
    "items": [
      {
        "id": "maki-1",
        "name": "California",
        "price": 145,
        "desc": "Gurka, avokado, lax, krabbstick, sesamfrön, toppad med chilimajonnäs och teriyakisås"
      },
      {
        "id": "maki-2",
        "name": "Chili maki",
        "price": 145,
        "desc": "Lax, jätteräka, gurka, avokado, chili, chilimajonnäs, sesamfrön, toppad med chilimajonnäs"
      },
      {
        "id": "maki-3",
        "name": "Philadelphia maki",
        "price": 145,
        "desc": "Lax, färskost, gurka, avokado, toppad med sesamfrön"
      },
      {
        "id": "maki-4",
        "name": "Alaskan maki",
        "price": 145,
        "desc": "Lax, gurka, avokado, toppad med chilimajonnäs och vårlök"
      },
      {
        "id": "maki-5",
        "name": "Green maki",
        "price": 145,
        "desc": "Wakamesallad, avokado, gurka, toppad med teriyakisås och sesamfrön"
      },
      {
        "id": "maki-6",
        "name": "Vegan maki",
        "price": 145,
        "desc": "Gurka, avokado, tofu, paprika, sesamfrön, toppad med vegansk majonnäs"
      },
      {
        "id": "maki-7",
        "name": "Egen hoso maki, 4 bitar",
        "price": 65,
        "desc": "Välj mellan lax, avokado eller gurka"
      },
      {
        "id": "maki-8",
        "name": "Egen hoso maki, 8 bitar",
        "price": 95,
        "desc": "Välj mellan lax, avokado eller gurka"
      }
    ]
  },
  {
    "id": "lyx",
    "name": "Lyx maki",
    "items": [
      {
        "id": "lyx-1",
        "name": "Spicy salmon maki",
        "price": 155,
        "desc": "Spicy salmon, gurka, avokado, vårlök, chilimajonnäs och teriyakisås"
      },
      {
        "id": "lyx-2",
        "name": "Spicy tuna maki",
        "price": 155,
        "desc": "Spicy tuna, gurka, avokado, vårlök, chilimajonnäs och teriyakisås"
      },
      {
        "id": "lyx-3",
        "name": "Sunset maki",
        "price": 155,
        "desc": "Krabbröra, avokado, toppad med vårlök, rostad lök, chilimajonnäs och teriyakisås"
      },
      {
        "id": "lyx-4",
        "name": "Tempura maki",
        "price": 159,
        "desc": "Tempuraräkor, avokado, toppad med vårlök, rostad lök, chilimajonnäs och teriyakisås"
      },
      {
        "id": "lyx-5",
        "name": "Tiger maki",
        "price": 159,
        "desc": "Krabbstick, gurka, avokado, toppad med jätteräkor, vårlök, sesamfrön och chilimajonnäs"
      },
      {
        "id": "lyx-6",
        "name": "King salmon maki",
        "price": 159,
        "desc": "Lax, färskost, avokado, toppad med lax, chilimajonnäs och sesamfrön"
      },
      {
        "id": "lyx-7",
        "name": "Biff maki",
        "price": 159,
        "desc": "Strimlad biff, avokado, toppad med vårlök, rostad lök, chilimajonnäs och teriyakisås"
      }
    ]
  },
  {
    "id": "deluxe",
    "name": "Deluxe maki",
    "items": [
      {
        "id": "deluxe-1",
        "name": "Hanami maki",
        "price": 165,
        "desc": "Friterad rulle med tempuraräkor, gurka, avokado, toppad med vårlök, rostad lök, chilimajonnäs och teriyakisås"
      },
      {
        "id": "deluxe-2",
        "name": "Dragon's salmon maki",
        "price": 165,
        "desc": "Tempuraräkor, avokado, gurka, toppad med flamberad lax, vårlök, rostad lök, chilimajonnäs och teriyakisås"
      },
      {
        "id": "deluxe-3",
        "name": "Kyoto maki",
        "price": 165,
        "desc": "Krabbröra, gurka, avokado, toppad med flamberad lax, aioli, teriyakisås, rostad lök och vårlök"
      },
      {
        "id": "deluxe-4",
        "name": "Crispy chicken maki",
        "price": 165,
        "desc": "Friterad rulle med pankofriterad kyckling, färskost, gurka, toppad med chilimajonnäs, teriyakisås och rostad lök"
      },
      {
        "id": "deluxe-5",
        "name": "Poseidon maki",
        "price": 165,
        "desc": "Friterad rulle med spicy salmon, avokado, gurka, toppad med chilimajonnäs, teriyakisås, rostad lök och vårlök"
      }
    ]
  },
  {
    "id": "sashimi",
    "name": "Sashimi",
    "items": [
      {
        "id": "sashimi-1",
        "name": "Sashimi lax",
        "price": 155,
        "desc": "10 bitar tunt skuren rå lax, serveras med sallad och tillbehör"
      },
      {
        "id": "sashimi-2",
        "name": "Sashimi mix",
        "price": 165,
        "desc": "10 bitar: 5 lax, 2 jätteräkor, 2 tonfisk, 1 krabbstick, serveras med sallad och tillbehör"
      }
    ]
  },
  {
    "id": "poke",
    "name": "Poke bowls",
    "items": [
      {
        "id": "poke-1",
        "name": "Lax poke",
        "price": 165,
        "desc": "Lax, sushiris, salladsmix, avokado, picklad rödkål, gurka, mango, sjögrässallad, edamamebönor, sesamfrön, chilimajonnäs, teriyakisås"
      },
      {
        "id": "poke-2",
        "name": "Räka poke",
        "price": 165,
        "desc": "Färska jätteräkor, sushiris, salladsmix, avokado, picklad rödkål, gurka, mango, sjögrässallad, edamamebönor, sesamfrön, aioli"
      },
      {
        "id": "poke-3",
        "name": "Tempura‑räka bowl",
        "price": 169,
        "desc": "Tempuraräkor, sushiris, salladsmix, avokado, picklad rödkål, gurka, mango, sjögrässallad, edamamebönor, sesamfrön, chilimajonnäs, teriyakisås"
      },
      {
        "id": "poke-4",
        "name": "Crunchy chicken bowl",
        "price": 169,
        "desc": "Friterad kycklingfilé, sushiris, salladsmix, avokado, picklad rödkål, gurka, mango, sjögrässallad, edamamebönor, sesamfrön, chilimajonnäs, teriyakisås"
      },
      {
        "id": "poke-5",
        "name": "Biff poke bowl",
        "price": 169,
        "desc": "Strimlad biff, sushiris, salladsmix, avokado, picklad rödkål, gurka, mango, sjögrässallad, edamamebönor, sesamfrön, chilimajonnäs, teriyakisås"
      },
      {
        "id": "poke-6",
        "name": "Vegansk poke",
        "price": 159,
        "desc": "Tofu, sushiris, salladsmix, avokado, picklad rödkål, gurka, mango, sjögrässallad, edamamebönor, sesamfrön, teriyakisås"
      }
    ]
  },
  {
    "id": "varmt",
    "name": "Varmrätter",
    "items": [
      {
        "id": "varmt-1",
        "name": "Gyoza",
        "price": 129,
        "desc": "7 kycklingdumplings med ris, sallad, sesamfrön, teriyakisås och chilimajonnäs"
      },
      {
        "id": "varmt-2",
        "name": "Tempura ebi",
        "price": 129,
        "desc": "Pankofriterade räkor med ris, sallad, sesamfrön, teriyakisås och chilimajonnäs"
      },
      {
        "id": "varmt-3",
        "name": "Yakiniku",
        "price": 155,
        "desc": "Strimlad biff med ris, sallad, sesamfrön, teriyakisås och chilimajonnäs"
      },
      {
        "id": "varmt-4",
        "name": "Yaki udon",
        "price": 155,
        "desc": "Stekta nudlar med strimlad biff, röd paprika, morötter och edamamebönor, toppad med sallad, kimchisallad och vårlök"
      },
      {
        "id": "varmt-5",
        "name": "Chicken katsu",
        "price": 155,
        "desc": "2 pankofriterad kyckling med tonkatsusås, sushiris, salladsmix och sesamfrön"
      },
      {
        "id": "varmt-6",
        "name": "Kycklingspett",
        "price": 155,
        "desc": "3 kycklingspett med sushiris, salladsmix, sesamfrön och teriyakisås"
      }
    ]
  },
  {
    "id": "burrito",
    "name": "Sushi burrito, friterad",
    "note": "Toppad med chilimajonnäs, teriyakisås, rosa aioli, rostad lök och vårlök.",
    "items": [
      {
        "id": "burrito-1",
        "name": "Hanami sushi burrito",
        "price": 165,
        "desc": "Tempuraräkor, gurka, avokado"
      },
      {
        "id": "burrito-2",
        "name": "Crispy chicken sushi burrito",
        "price": 165,
        "desc": "Crispy chicken, gurka, färskost"
      },
      {
        "id": "burrito-3",
        "name": "Kyoto sushi burrito",
        "price": 165,
        "desc": "Krabbröra, gurka, avokado"
      },
      {
        "id": "burrito-4",
        "name": "Poseidon sushi burrito",
        "price": 165,
        "desc": "Spicy lax, gurka, avokado"
      },
      {
        "id": "burrito-5",
        "name": "Biff sushi burrito",
        "price": 165,
        "desc": "Strimlad biff med avokado"
      }
    ]
  },
  {
    "id": "bento",
    "name": "Bento box",
    "items": [
      {
        "id": "bento-1",
        "name": "Yaki bento",
        "price": 169,
        "desc": "Yakiniku med teriyakisås, 2 nigiri lax, 2 nigiri räkor, 2 minivårrullar, 2 gyoza, sushiris, sweetchilisås, salladsmix med sesamfrön"
      },
      {
        "id": "bento-2",
        "name": "Hanami bento",
        "price": 175,
        "desc": "1 pankofriterad kyckling med tonkatsusås, 5 tempura maki, 2 minivårrullar, 2 gyoza, sushiris, salladsmix med sesamdressing och chilimajonnäs"
      },
      {
        "id": "bento-3",
        "name": "All kött bento",
        "price": 175,
        "desc": "1 pankofriterad kyckling med tonkatsusås, 1 kycklingspett med teriyakisås, yakiniku med teriyakisås, sushiris, salladsmix med sesamdressing och chilimajonnäs"
      }
    ]
  },
  {
    "id": "barn",
    "name": "Barnmeny",
    "items": [
      {
        "id": "barn-1",
        "name": "Doraemon sushi",
        "price": 80,
        "desc": "1 lax, 1 räka, 1 avokado, 4 små maki (gurka)"
      },
      {
        "id": "barn-2",
        "name": "Conan karaage",
        "price": 80,
        "desc": "5 bitar kycklinglårfilé med ris, sallad, sesamfrön och teriyakisås"
      },
      {
        "id": "barn-3",
        "name": "Chicken nugget",
        "price": 80,
        "desc": "5 bitar chicken nuggets med ris, salladsmix, sesamfrön och teriyakisås"
      },
      {
        "id": "barn-4",
        "name": "Barn yakiniku",
        "price": 95,
        "desc": "Strimlad biff med teriyakisås, sushiris och salladsmix"
      },
      {
        "id": "barn-5",
        "name": "Kid bento",
        "price": 105,
        "desc": "1 kycklingspett med teriyakisås, 4 små bitar gurkmaki, 3 friterade minivårrullar, sushiris, salladsmix och sweetchilisås"
      }
    ]
  },
  {
    "id": "tillbehor",
    "name": "Förrätter & tillbehör",
    "items": [
      {
        "id": "tillbehor-1",
        "name": "Chicken karaage, 5 st",
        "price": 55,
        "desc": "Friterad kycklinglårfilé"
      },
      {
        "id": "tillbehor-2",
        "name": "Chicken karaage, 10 st",
        "price": 100,
        "desc": "Friterad kycklinglårfilé"
      },
      {
        "id": "tillbehor-3",
        "name": "Risnätsvårrullar, 4 st",
        "price": 55,
        "desc": "Skaldjursfyllning"
      },
      {
        "id": "tillbehor-4",
        "name": "Risnätsvårrullar, 8 st",
        "price": 100,
        "desc": "Skaldjursfyllning"
      },
      {
        "id": "tillbehor-5",
        "name": "Minivårrullar, 6 st",
        "price": 49,
        "desc": "Friterade vegetariska minivårrullar med sweetchilisås"
      },
      {
        "id": "tillbehor-6",
        "name": "Minivårrullar, 12 st",
        "price": 90,
        "desc": "Friterade vegetariska minivårrullar med sweetchilisås"
      },
      {
        "id": "tillbehor-7",
        "name": "Räkchips, 10 st",
        "price": 25
      },
      {
        "id": "tillbehor-8",
        "name": "Räkchips, 20 st",
        "price": 35
      },
      {
        "id": "tillbehor-9",
        "name": "Chicken nugget, 5 st",
        "price": 55
      },
      {
        "id": "tillbehor-10",
        "name": "Kycklingspett, 1 st",
        "price": 40
      },
      {
        "id": "tillbehor-11",
        "name": "Wakamesallad",
        "price": 39,
        "desc": "Marinerad sjögrässallad"
      },
      {
        "id": "tillbehor-12",
        "name": "Rosa ingefära",
        "price": 39
      },
      {
        "id": "tillbehor-13",
        "name": "Edamame",
        "price": 45,
        "desc": "Sojabönor med flingsalt"
      },
      {
        "id": "tillbehor-14",
        "name": "Kimchisallad",
        "price": 39
      },
      {
        "id": "tillbehor-15",
        "name": "Sushiris",
        "price": 29
      },
      {
        "id": "tillbehor-16",
        "name": "Chilimajonnäs",
        "price": 15
      },
      {
        "id": "tillbehor-17",
        "name": "Tonkatsusås",
        "price": 15
      },
      {
        "id": "tillbehor-18",
        "name": "Aioli",
        "price": 15
      },
      {
        "id": "tillbehor-19",
        "name": "Teriyakisås",
        "price": 15
      },
      {
        "id": "tillbehor-20",
        "name": "Sushisoja",
        "price": 12
      },
      {
        "id": "tillbehor-21",
        "name": "Misosoppa",
        "price": 0,
        "desc": "Ingår"
      }
    ]
  },
  {
    "id": "dryck",
    "name": "Dryck",
    "items": [
      {
        "id": "dryck-1",
        "name": "Läsk",
        "price": 22
      },
      {
        "id": "dryck-2",
        "name": "Mineralvatten",
        "price": 22
      }
    ]
  },
  {
    "id": "bubble",
    "name": "Bubble tea",
    "note": "Njut av vår Bubble Tea med tapiokapärlor och 1 valfri popping boba – ingår!\nVälj mellan Classic, Matcha eller Taro.\nPopping boba: Mango, jordgubb, blåbär eller lychee.\nVill du ha extra topping? +10 kr/st.",
    "items": [
      {
        "id": "bubble-1",
        "name": "Classic milk tea",
        "price": 69
      },
      {
        "id": "bubble-2",
        "name": "Taro milk tea",
        "price": 69
      },
      {
        "id": "bubble-3",
        "name": "Matcha milk tea",
        "price": 69
      }
    ]
  }
];
