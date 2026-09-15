/* English presentation layer for legacy Gujarati labels and API feedback. */
(function () {
    'use strict';

    const translations = {
        'આવક અને ઉત્પાદન': 'Inward & Production',
        'ડિસ્પેચ અને સ્કેનિંગ': 'Dispatch & Scanning',
        'માસ્ટર કંટ્રોલ': 'Master Control',
        'રિપોર્ટ્સ અને લોગ': 'Reports & Logs',
        'માલની આવક': 'Material Inward',
        'સપ્લાયર પાસેથી આવેલ માલ': 'Supplier Material Inward',
        'નવું મશીન ઉમેરો': 'Add New Machine',
        'મશીન પ્રોડક્શન એન્ટ્રી': 'Machine Production Entry',
        'તાજેતરનું પ્રોડક્શન લોગ': 'Recent Production Log',
        'જૂના QR કોડ શોધો અને પ્રિન્ટ કરો': 'Search and Print Old QR Codes',
        'સ્ટીકર પ્રિન્ટ કરો': 'Print Sticker',
        'QR પ્રિન્ટ કરો': 'Print QR',
        'શોધો': 'Search',
        'પસંદ કરો': 'Select',
        'કન્સલ': 'Cancel',
        'પાછળ': 'Previous',
        'આગળ': 'Next',
        'તારીખ': 'Date',
        'યુઝર': 'User',
        'એક્શન': 'Action',
        'વિગત': 'Details',
        'કોઈ રેકોર્ડ ઉપલબ્ધ નથી': 'No records available',
        'કોઈ આઈટમ્સ ઉપલબ્ધ નથી': 'No items available',
        'કોઈ મશીન ઉપલબ્ધ નથી': 'No machines available',
        'કોઈ એક્ટિવિટી લોગ મળ્યો નથી.': 'No activity logs found.',
        'કોઈ Inward રેકોર્ડ મળ્યો નથી.': 'No inward records found.',
        'કોઈ Outward રેકોર્ડ મળ્યો નથી.': 'No outward records found.',
        'લોડ થઈ રહ્યો છે...': 'Loading...',
        'શોધાઈ રહ્યું છે...': 'Searching...',
        'સફળતાપૂર્વક': 'successfully',
        'સફળતા': 'Success',
        'એરર': 'Error',
        'ચેતવણી': 'Warning',
        'માહિતી': 'Information',
        'કૃપા કરીને': 'Please',
        'પહેલા': 'first',
        'ફાઈલ પસંદ કરો': 'select a file',
        'ફરી પ્રયાસ કરો': 'Try again',
        'સર્વર સાથે કનેક્શન થઈ શક્યું નથી.': 'Unable to connect to the server.',
        'સેવ થઈ શક્યું નથી': 'Could not be saved',
        'ડીલીટ': 'Delete',
        'ડેટા': 'data',
        'આઈટમ': 'item',
        'આઈટમ્સ': 'items',
        'મશીન': 'machine',
        'જથ્થો': 'quantity',
        'બાકી': 'remaining',
        'સ્ટોક': 'stock',
        'બોક્સ': 'box',
        'કોઇલ': 'coil',
        'ગાડી': 'vehicle',
        'ડ્રાઈવર': 'driver',
        'ટ્રાન્સપોર્ટર': 'transporter',
        'નામ': 'name',
        'નવું': 'new',
        'આવેલ': 'received',
        'ગયેલ': 'issued',
        'બહાર': 'outward',
        'અંદર': 'inward',
        'પ્રોડક્શન': 'production',
        'ડિસ્પેચ': 'dispatch',
        'સ્કેનર': 'scanner',
        'સ્કેનિંગ': 'scanning',
        'ફિલ્ટર': 'filter',
        'લેજર': 'ledger',
        'હિસ્ટ્રી': 'history',
        'મેનેજમેન્ટ': 'management',
        'બનાવો': 'Create',
        'ઉમેરો': 'Add',
        'ફેરફાર સેવ કરો': 'Save Changes',
        'સેવ કરો': 'Save',
        'ઈમ્પોર્ટ': 'Import',
        'અપલોડ': 'Upload',
        'ડાઉનલોડ': 'Download',
        'રીસેટ': 'Reset'
        ,'નવા': 'new'
        ,'નવી': 'new'
        ,'માલ': 'material'
        ,'એન્ટ્રી': 'entry'
        ,'કોડ': 'code'
        ,'જનરેટ': 'generate'
        ,'કરો': 'do'
        ,'કરવા': 'to do'
        ,'કર્યો': 'done'
        ,'કરી': 'and'
        ,'કરવામાં': 'while'
        ,'માટે': 'for'
        ,'પાસેથી': 'from'
        ,'સાથે': 'with'
        ,'દ્વારા': 'by'
        ,'અને': 'and'
        ,'અથવા': 'or'
        ,'જો': 'if'
        ,'તો': 'then'
        ,'છે': 'is'
        ,'થયું': 'completed'
        ,'થઈ': 'completed'
        ,'થયો': 'completed'
        ,'થશે': 'will be'
        ,'થાય': 'is'
        ,'નથી': 'not'
        ,'હજી સુધી': 'yet'
        ,'તમામ': 'all'
        ,'ફક્ત': 'only'
        ,'ઓછામાં ઓછી': 'at least'
        ,'માન્ય': 'valid'
        ,'ખોટો': 'invalid'
        ,'ઉપલબ્ધ': 'available'
        ,'લોડ': 'load'
        ,'ચેક': 'check'
        ,'પસંદ': 'select'
        ,'ટાઈપ': 'type'
        ,'લિસ્ટ': 'list'
        ,'ફોર્મેટ': 'format'
        ,'પ્રિન્ટ': 'print'
        ,'વિવરણ': 'description'
        ,'કારણ': 'reason'
        ,'એકમ': 'unit'
        ,'કુલ': 'total'
        ,'આજની': "today's"
        ,'આજનું': "today's"
        ,'મુખ્ય': 'main'
        ,'ફંકશન્સ': 'functions'
        ,'સિસ્ટમ': 'system'
        ,'સ્ટોર': 'store'
        ,'ગોડાઉન': 'warehouse'
        ,'લોડિંગ': 'loading'
        ,'સ્વીકારનાર': 'receiver'
        ,'મોકલાયો': 'sent'
        ,'મોકલવાની': 'to send'
        ,'મોકલો': 'send'
        ,'મળ્યો નથી': 'not found'
        ,'મળી નથી': 'not found'
        ,'મળ્યા નથી': 'not found'
        ,'ચોક્કસ': 'specific'
        ,'ફરીથી': 'again'
        ,'હાલ': 'current'
        ,'હવે': 'now'
        ,'બધો': 'all'
        ,'બધા': 'all'
        ,'આઈટમનું': 'item'
        ,'આઈટમની': 'item'
        ,'મશીનનું': 'machine'
        ,'મશીનને': 'machine'
        ,'નો': ''
        ,'ની': ''
        ,'નું': ''
        ,'ને': ''
        ,'માં': 'in'
        ,'થી': 'from'
        ,'પર': 'on'
        ,'પણ': 'also'
        ,'જ': ''
    };

    const entries = Object.entries(translations).sort((a, b) => b[0].length - a[0].length);
    function translate(value) {
        if (typeof value !== 'string' || !/[\u0A80-\u0AFF]/.test(value)) return value;
        const translated = entries.reduce((text, [from, to]) => text.split(from).join(to), value);
        // Do not leave mixed Gujarati fragments in an otherwise English interface.
        return translated.replace(/[\u0A80-\u0AFF]+/g, ' ').replace(/\s{2,}/g, ' ');
    }
    function translateElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(element.tagName)) return;
        ['placeholder', 'title', 'aria-label', 'value'].forEach(attribute => {
            if (element.hasAttribute(attribute)) element.setAttribute(attribute, translate(element.getAttribute(attribute)));
        });
        element.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) node.nodeValue = translate(node.nodeValue);
            else translateElement(node);
        });
    }
    function translatePage() { translateElement(document.body); }
    document.addEventListener('DOMContentLoaded', () => {
        translatePage();
        new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) node.nodeValue = translate(node.nodeValue);
            else translateElement(node);
        }))).observe(document.body, { childList: true, subtree: true });
    });
    ['alert', 'confirm', 'prompt'].forEach(name => {
        const nativeFunction = window[name];
        window[name] = function (message, ...args) { return nativeFunction.call(window, translate(message), ...args); };
    });
    window.translateGujaratiToEnglish = translate;
})();
