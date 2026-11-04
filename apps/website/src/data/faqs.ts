export const faqSections = [
  {
    title: 'Getting started',
    items: [
      {
        question: 'What is Active?',
        blocks: [
          {
            type: 'p',
            text: 'Active is a platform that connects people who need things done with people willing to do them for money. Whether you need help with an errand, a repair, a delivery, or another everyday task, you can post a request and receive responses from people nearby.',
          },
          {
            type: 'p',
            text: 'You can also use Active to find requests, offer your services, and earn money.',
          },
        ],
      },
      {
        question: 'Can I use Active to both request help and earn money?',
        blocks: [
          {
            type: 'p',
            text: "Absolutely! You don't need separate accounts. You can post requests when you need help and respond to other people's requests when you want to earn. Switch between both whenever you like.",
          },
        ],
      },
      {
        question: 'What types of tasks can I post on Active?',
        blocks: [
          {
            type: 'p',
            text: 'You can post a wide range of everyday tasks, including home repairs, cleaning, errands, deliveries, food preparation, car-related services, and other legitimate services.',
          },
          {
            type: 'p',
            text: "Tasks must comply with Active's community guidelines and applicable laws. If you're unsure whether a task is allowed, contact our support team before posting it.",
          },
        ],
      },
      {
        question: 'Where is Active currently available?',
        blocks: [
          {
            type: 'p',
            text: 'Active is launching in **Nigeria**. Availability may vary by area as we expand. You can check the app to see whether there are requests and people available around your location.',
          },
        ],
      },
    ],
  },
  {
    title: 'Requests & getting help',
    items: [
      {
        question: 'What are the requirements to respond to requests?',
        blocks: [
          {
            type: 'p',
            text: "You need an Active account and must complete the required profile setup. You'll also need to take a profile photo using the in-app camera. This helps people see who they're communicating with.",
          },
          {
            type: 'p',
            text: "Before responding, make sure you understand the task, can meet the requester's schedule, and are comfortable with the offered amount. Keep communication and payments within Active so there's a record of the agreement.",
          },
        ],
      },
      {
        question: "What happens if the person I selected doesn't complete the task?",
        blocks: [
          {
            type: 'p',
            text: 'If the person you selected fails to complete the task, or you encounter a problem, report the issue through the app.',
          },
          {
            type: 'p',
            text: 'The payment remains locked while an active issue is being reviewed. Active may review the request details, chat history, and any evidence provided by both parties before deciding the appropriate resolution. Any refund will depend on the circumstances and the outcome of the review.',
          },
        ],
      },
      {
        question: "What happens if the requester doesn't confirm completion?",
        blocks: [
          {
            type: 'p',
            text: 'When a worker marks a task as completed, the requester is notified and can review the work.',
          },
          {
            type: 'p',
            text: "If the requester neither confirms completion nor raises a dispute within **72 hours**, the task is automatically marked as completed and the worker's earnings are released to their Active wallet.",
          },
          {
            type: 'p',
            text: "If there's a genuine problem with the work, the requester should report it within that period rather than simply leaving the task unconfirmed.",
          },
        ],
      },
    ],
  },
  {
    title: 'Payments & earnings',
    items: [
      {
        question: 'When is money deducted from my wallet?',
        blocks: [
          {
            type: 'p',
            text: 'Your offer amount is not locked simply because you post a request. Funds are locked when you accept a responder.',
          },
          {
            type: 'p',
            text: 'The amount is then held until the task is completed and the payment is ready to be released, or until an issue is resolved.',
          },
        ],
      },
      {
        question: 'How do I receive my earnings?',
        blocks: [
          {
            type: 'p',
            text: "Once a task is confirmed as completed, your earnings are credited to your Active wallet, minus Active's service fee.",
          },
          {
            type: 'p',
            text: 'You can view your available balance in your wallet and withdraw eligible funds to your registered bank account.',
          },
        ],
      },
      {
        question: 'How much does Active charge?',
        blocks: [
          {
            type: 'p',
            text: "Active charges a **10% service fee on the worker's payout** when a task is completed.",
          },
          {
            type: 'p',
            text: 'For example, if you earn ₦10,000, Active deducts ₦1,000 and you receive ₦9,000.',
          },
          {
            type: 'p',
            text: 'There are no separate charges hidden in the agreed task amount. Any applicable payment or withdrawal charges should be shown clearly before you complete the transaction.',
          },
        ],
      },
      {
        question: 'What happens if a requester disputes completed work?',
        blocks: [
          {
            type: 'p',
            text: 'If a requester raises a dispute, the payment remains locked while Active reviews the issue.',
          },
          {
            type: 'p',
            text: 'Both the requester and the worker may be asked to provide information or evidence, such as messages, photos, videos, or other relevant details. Active reviews the available evidence and determines the appropriate outcome.',
          },
          {
            type: 'p',
            text: 'The funds are released or refunded according to the outcome of the dispute. Neither party should assume the payment will automatically go to them while a dispute is being reviewed.',
          },
        ],
      },
    ],
  },
  {
    title: 'Withdrawals',
    items: [
      {
        question: 'How do I withdraw money to my bank account?',
        blocks: [
          {
            type: 'p',
            text: 'To withdraw your earnings:',
          },
          {
            type: 'ol',
            items: [
              'Open your Active wallet.',
              'Select **Withdraw**.',
              "Add your Nigerian bank account details if you haven't already.",
              'Complete the required NIN submission.',
              'Enter the amount you want to withdraw and submit your request.',
            ],
          },
          {
            type: 'p',
            text: 'Make sure your bank details are correct before submitting. You can check your withdrawal status in the app.',
          },
        ],
      },
      {
        question: 'Why do I need to provide my NIN before withdrawing?',
        blocks: [
          {
            type: 'p',
            text: 'Active requires your National Identification Number (NIN) as part of its identity and payout requirements.',
          },
          {
            type: 'p',
            text: 'This helps associate withdrawals with an identifiable account holder and adds an additional layer of protection to the payout process. Your NIN should be submitted only through the designated secure flow in the app.',
          },
        ],
      },
      {
        question: 'How long do withdrawals take?',
        blocks: [
          {
            type: 'p',
            text: 'Withdrawals can take between **1–5 business days**, depending on your bank and the payment system. You can check the status of your withdrawal in your Active wallet. If a withdrawal takes longer than the stated processing period, contact our support team with the transaction details.',
          },
        ],
      },
    ],
  },
  {
    title: 'Trust & verification',
    items: [
      {
        question: 'How does user verification work on Active?',
        blocks: [
          {
            type: 'p',
            text: 'Active uses account and profile checks to help build trust between users.',
          },
          {
            type: 'ul',
            items: [
              '**Phone verification:** You confirm that you have access to your phone number using a one-time password (OTP).',
              "**Profile photo:** You must capture your profile photo using the in-app camera before responding to requests. This helps other users recognise who they're dealing with.",
              '**NIN requirement:** You must submit your NIN before you can withdraw money.',
            ],
          },
          {
            type: 'p',
            text: "These steps serve different purposes. A profile photo does not, by itself, mean your identity has been verified. Likewise, submitting an NIN should not be described as independent government-database verification unless Active has actually completed that check. The Verified badge should only appear when the required verification status has been confirmed by Active's system.",
          },
        ],
      },
    ],
  },
] as const;
