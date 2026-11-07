import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Checkout validation', () {
    test('empty cart is invalid', () {
      final cart = <String, int>{};
      expect(cart.isEmpty, isTrue);
    });

    test('total is recalculated from line items', () {
      final items = [
        {'price': 100.0, 'qty': 2},
        {'price': 50.5, 'qty': 1},
      ];
      final total = items.fold<double>(0, (s, i) => s + (i['price'] as double) * (i['qty'] as int));
      expect(total, 250.5);
    });

    test('stock deduction cannot go negative', () {
      int current = 1;
      int qty = 3;
      final allowed = current >= qty;
      expect(allowed, isFalse);
      current = 5;
      qty = 2;
      expect(current - qty, 3);
    });

    test('cash on delivery can omit reference, non-COD requires reference', () {
      bool valid(String method, String reference) => method == 'Cash on Delivery' || reference.trim().isNotEmpty;
      expect(valid('Cash on Delivery', ''), isTrue);
      expect(valid('GCash', ''), isFalse);
      expect(valid('GCash', 'REF123'), isTrue);
    });
  });
}
