# 服務容器

* [簡介](#introduction)
  * [零組態解析](#zero-configuration-resolution)
  * [何時使用容器](#when-to-use-the-container)
* [綁定](#binding)
  * [綁定基礎](#binding-basics)
  * [將介面綁定至實作](#binding-interfaces-to-implementations)
  * [情境綁定](#contextual-binding)
  * [情境屬性](#contextual-attributes)
  * [綁定原生類型](#binding-primitives)
  * [綁定類型不固定引數](#binding-typed-variadics)
  * [標籤](#tagging)
  * [擴充綁定](#extending-bindings)
* [解析](#resolving)
  * [make 方法](#the-make-method)
  * [自動注入](#automatic-injection)
* [方法呼叫與注入](#method-invocation-and-injection)
* [容器事件](#container-events)
  * [重新綁定](#rebinding)
* [PSR-11](#psr-11)

<a name="introduction"></a>

## 簡介

Laravel 服務容器是一個功能強大的工具，用於管理類別依賴項並執行依賴注入。依賴注入是一個花俏的說法，其本質是：類別的依賴項透過建構函式，或在某些情況下透過「設定器 (setter)」方法「注入」到類別中。

讓我們先看一個簡單的例子：

```php
<?php

namespace App\Http\Controllers;

use App\Services\AppleMusic;
use Illuminate\View\View;

class PodcastController extends Controller
{
    /**
     * Create a new controller instance.
     */
    public function __construct(
        protected AppleMusic $apple,
    ) {}

    /**
     * Show information about the given podcast.
     */
    public function show(string $id): View
    {
        return view('podcasts.show', [
            'podcast' => $this->apple->findPodcast($id)
        ]);
    }
}
```

在此範例中，`PodcastController` 需要從諸如 Apple Music 之類的資料來源中檢索 Podcast。因此，我們將 **注入** 一個能夠檢索 Podcast 的服務。由於該服務是注入的，因此在測試應用程式時，我們能夠輕鬆地「模擬 (mock)」，或者說創建一個 `AppleMusic` 服務的虛擬實作。

深入理解 Laravel 服務容器對於建構功能強大、規模龐大的應用程式，以及為 Laravel 核心做出貢獻至關重要。

<a name="zero-configuration-resolution"></a>

### 零組態解析

如果一個類別沒有依賴項，或只依賴於其他具體類別 (而非介面)，則無需指示容器如何解析該類別。例如，您可以將以下程式碼放在您的 `routes/web.php` 檔案中：

```php
<?php

class Service
{
    // ...
}

Route::get('/', function (Service $service) {
    dd($service::class);
});
```

在此範例中，存取應用程式的 `/` 路由將會自動解析 `Service` 類別並將其注入到路由的處理常式中。這是一個顛覆性的功能。這表示您可以開發應用程式並利用依賴注入，而無需擔心臃腫的組態檔。

值得慶幸的是，當您建構 Laravel 應用程式時，許多您將編寫的類別都會自動透過容器接收其依賴項，包括 [控制器](/docs/{{version}}/controllers)、[事件監聽器](/docs/{{version}}/events)、[中介層](/docs/{{version}}/middleware) 等等。此外，您可以在 [佇列任務](/docs/{{version}}/queues) 的 `handle` 方法中型別提示依賴項。一旦您體驗到自動化和零組態依賴注入的強大功能，就感覺沒有它便無法進行開發。

<a name="when-to-use-the-container"></a>

### 何時使用容器

由於零組態解析，您通常會在路由、控制器、事件監聽器以及其他地方型別提示依賴項，而無需手動與容器互動。例如，您可以在路由定義上型別提示 `Illuminate\Http\Request` 物件，以便輕鬆存取當前請求。即使我們從未必須與容器互動來編寫此程式碼，它仍在幕後管理這些依賴項的注入：

```php
use Illuminate\Http\Request;

Route::get('/', function (Request $request) {
    // ...
});
```

在許多情況下，由於自動依賴注入和 [Facade](/docs/{{version}}/facades)，您可以建構 Laravel 應用程式，而無需 **手動** 綁定或解析容器中的任何內容。**那麼，您何時會手動與容器互動呢？** 讓我們來探討兩種情況。

首先，如果您編寫的類別實作了介面，並且您希望在路由或類別建構函式上型別提示該介面，您必須 [告訴容器如何解析該介面](#binding-interfaces-to-implementations)。其次，如果您正在 [編寫一個 Laravel 套件](/docs/{{version}}/packages) 並打算與其他 Laravel 開發者分享，您可能需要將套件的服務綁定到容器中。

<a name="binding"></a>

## 綁定

<a name="binding-basics"></a>

### 綁定基礎

<a name="simple-bindings"></a>

#### 簡單綁定

幾乎所有的服務容器綁定都會在 [服務提供者](/docs/{{version}}/providers) 中註冊，因此這些範例大部分都會在這個情境中示範如何使用容器。

在服務提供者中，您總是能透過 `此應用程式` 屬性來存取容器。我們可以透過 `bind` 方法來註冊綁定，傳入我們希望註冊的類別或介面名稱，以及一個會回傳類別實例的閉包：

```php
use App\Services\Transistor;
use App\Services\PodcastParser;
use Illuminate\Contracts\Foundation\Application;

$this->app->bind(Transistor::class, function (Application $app) {
    return new Transistor($app->make(PodcastParser::class));
});
```

請注意，我們將容器本身作為解析器的引數接收。然後我們可以利用容器來解析我們正在建構的物件的子依賴。

如前所述，您通常會在服務提供者中與容器互動；但是，如果您想在服務提供者之外與容器互動，您可以透過 `App` [Facade](/docs/{{version}}/facades) 來完成：

```php
use App\Services\Transistor;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\App;

App::bind(Transistor::class, function (Application $app) {
    // ...
});
```

您可以使用 `bindIf` 方法來註冊容器綁定，但僅在該給定型別尚未註冊綁定的情況下才進行註冊：

```php
$this->app->bindIf(Transistor::class, function (Application $app) {
    return new Transistor($app->make(PodcastParser::class));
});
```

為了方便起見，您可以省略提供希望註冊的類別或介面名稱作為單獨的引數，而是讓 Laravel 從您提供給 `bind` 方法的閉包的回傳型別推斷出該型別：

```php
App::bind(function (Application $app): Transistor {
    return new Transistor($app->make(PodcastParser::class));
});
```

> [!NOTE]
> 如果類別不依賴任何介面，則無需將其綁定到容器中。容器不需要被告知如何建構這些物件，因為它可以使用反射 (reflection) 自動解析這些物件。

<a name="binding-a-singleton"></a>

#### 綁定單例

`singleton` 方法將類別或介面綁定到容器中，該綁定只會解析一次。一旦單例綁定被解析，在後續對容器的呼叫中，將會回傳相同的物件實例：

```php
use App\Services\Transistor;
use App\Services\PodcastParser;
use Illuminate\Contracts\Foundation\Application;

$this->app->singleton(Transistor::class, function (Application $app) {
    return new Transistor($app->make(PodcastParser::class));
});
```

您可以使用 `singletonIf` 方法來註冊單例容器綁定，但僅在該給定型別尚未註冊綁定的情況下才進行註冊：

```php
$this->app->singletonIf(Transistor::class, function (Application $app) {
    return new Transistor($app->make(PodcastParser::class));
});
```

<a name="singleton-attribute"></a>

#### Singleton 屬性

或者，您可以為介面或類別標記 `#[Singleton]` 屬性，以指示容器它應該只被解析一次：

```php
<?php

namespace App\Services;

use Illuminate\Container\Attributes\Singleton;

#[Singleton]
class Transistor
{
    // ...
}
```

<a name="binding-scoped"></a>

#### 綁定作用域單例

`scoped` 方法將類別或介面綁定到容器中，該綁定在給定的 Laravel 請求/任務生命週期內只會解析一次。雖然此方法與 `singleton` 方法類似，但使用 `scoped` 方法註冊的實例會在 Laravel 應用程式啟動新的「生命週期」時被刷新，例如當 [Laravel Octane](/docs/{{version}}/octane) 工作者處理新請求時，或者當 Laravel [佇列工作者](/docs/{{version}}/queues) 處理新任務時：

```php
use App\Services\Transistor;
use App\Services\PodcastParser;
use Illuminate\Contracts\Foundation\Application;

$this->app->scoped(Transistor::class, function (Application $app) {
    return new Transistor($app->make(PodcastParser::class));
});
```

您可以使用 `scopedIf` 方法來註冊作用域容器綁定，但僅在該給定型別尚未註冊綁定的情況下才進行註冊：

```php
$this->app->scopedIf(Transistor::class, function (Application $app) {
    return new Transistor($app->make(PodcastParser::class));
});
```

<a name="scoped-attribute"></a>

#### Scoped 屬性

或者，您可以為介面或類別標記 `#[Scoped]` 屬性，以指示容器它在給定的 Laravel 請求/任務生命週期內只會被解析一次：

```php
<?php

namespace App\Services;

use Illuminate\Container\Attributes\Scoped;

#[Scoped]
class Transistor
{
    // ...
}
```

<a name="binding-instances"></a>

#### 綁定實例

您也可以使用 `instance` 方法將現有的物件實例綁定到容器中。在後續對容器的呼叫中，將始終回傳該給定的實例：

```php
use App\Services\Transistor;
use App\Services\PodcastParser;

$service = new Transistor(new PodcastParser);

$this->app->instance(Transistor::class, $service);
```

<a name="binding-interfaces-to-implementations"></a>

### 綁定介面至實作

服務容器的一個非常強大的功能是它能夠將介面綁定到給定的實作。例如，假設我們有一個 `EventPusher` 介面和一個 `RedisEventPusher` 實作。一旦我們為這個介面編寫了 `RedisEventPusher` 實作，我們就可以這樣將它註冊到服務容器中：

```php
use App\Contracts\EventPusher;
use App\Services\RedisEventPusher;

$this->app->bind(EventPusher::class, RedisEventPusher::class);
```

這個語句告訴容器，當一個類別需要 `EventPusher` 的實作時，它應該注入 `RedisEventPusher`。現在我們可以在由容器解析的類別的建構函式中型別提示 `EventPusher` 介面。請記住，Laravel 應用程式中的控制器、事件監聽器、中介層以及各種其他型別的類別，總是會透過容器解析：

```php
use App\Contracts\EventPusher;

/**
 * Create a new class instance.
 */
public function __construct(
    protected EventPusher $pusher,
) {}
```

<a name="bind-attribute"></a>

#### Bind 屬性

Laravel 也提供了一個 `Bind` 屬性以增加便利性。您可以將此屬性套用到任何介面，以告知 Laravel 每當請求該介面時，應該自動注入哪個實作。使用 `Bind` 屬性時，無需在應用程式的服務提供者中執行任何額外的服務註冊。

此外，可以在介面上放置多個 `Bind` 屬性，以便為給定的環境集合配置不同的實作：

```php
<?php

namespace App\Contracts;

use App\Services\FakeEventPusher;
use App\Services\RedisEventPusher;
use Illuminate\Container\Attributes\Bind;

#[Bind(RedisEventPusher::class)]
#[Bind(FakeEventPusher::class, environments: ['local', 'testing'])]
interface EventPusher
{
    // ...
}
```

此外，可以應用 [Singleton](#singleton-attribute) 和 [Scoped](#scoped-attribute) 屬性來指示容器綁定是應該解析一次，還是每個請求/任務生命週期解析一次：

```php
use App\Services\RedisEventPusher;
use Illuminate\Container\Attributes\Bind;
use Illuminate\Container\Attributes\Singleton;

#[Bind(RedisEventPusher::class)]
#[Singleton]
interface EventPusher
{
    // ...
}
```

<a name="contextual-binding"></a>

### 情境式綁定

有時候您可能有兩個類別使用相同的介面，但您希望向每個類別注入不同的實作。例如，兩個控制器可能依賴於 `Illuminate\Contracts\Filesystem\Filesystem` [契約](/docs/{{version}}/contracts) 的不同實作。Laravel 提供了一個簡單流暢的介面來定義這種行為：

```php
use App\Http\Controllers\PhotoController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\VideoController;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

$this->app->when(PhotoController::class)
    ->needs(Filesystem::class)
    ->give(function () {
        return Storage::disk('local');
    });

$this->app->when([VideoController::class, UploadController::class])
    ->needs(Filesystem::class)
    ->give(function () {
        return Storage::disk('s3');
    });
```

<a name="contextual-attributes"></a>

### 情境屬性

由於情境式綁定常用於注入驅動程式實作或配置值，Laravel 提供了多種情境式綁定屬性，允許注入這些型別的值，而無需在服務提供者中手動定義情境式綁定。

例如，`Storage` 屬性可用於注入特定的 [儲存磁碟](/docs/{{version}}/filesystem)：

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Container\Attributes\Storage;
use Illuminate\Contracts\Filesystem\Filesystem;

class PhotoController extends Controller
{
    public function __construct(
        #[Storage('local')] protected Filesystem $filesystem
    ) {
        // ...
    }
}
```

除了 `Storage` 屬性之外，Laravel 還提供了 `Auth`、`Cache`、`Config`、`Context`、`DB`、`Give`、`Log`、`RouteParameter` 以及 [Tag](#tagging) 屬性：

```php
<?php

namespace App\Http\Controllers;

use App\Contracts\UserRepository;
use App\Models\Photo;
use App\Repositories\DatabaseRepository;
use Illuminate\Container\Attributes\Auth;
use Illuminate\Container\Attributes\Cache;
use Illuminate\Container\Attributes\Config;
use Illuminate\Container\Attributes\Context;
use Illuminate\Container\Attributes\DB;
use Illuminate\Container\Attributes\Give;
use Illuminate\Container\Attributes\Log;
use Illuminate\Container\Attributes\RouteParameter;
use Illuminate\Container\Attributes\Tag;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Database\Connection;
use Psr\Log\LoggerInterface;

class PhotoController extends Controller
{
    public function __construct(
        #[Auth('web')] protected Guard $auth,
        #[Cache('redis')] protected Repository $cache,
        #[Config('app.timezone')] protected string $timezone,
        #[Context('uuid')] protected string $uuid,
        #[Context('ulid', hidden: true)] protected string $ulid,
        #[DB('mysql')] protected Connection $connection,
        #[Give(DatabaseRepository::class)] protected UserRepository $users,
        #[Log('daily')] protected LoggerInterface $log,
        #[RouteParameter('photo')] protected Photo $photo,
        #[Tag('reports')] protected iterable $reports,
    ) {
        // ...
    }
}
```

此外，Laravel 提供了一個 `CurrentUser` 屬性，用於將當前已驗證使用者注入到給定的路由或類別中：

```php
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;

Route::get('/user', function (#[CurrentUser] User $user) {
    return $user;
})->middleware('auth');
```

<a name="defining-custom-attributes"></a>

#### 定義自訂屬性

您可以透過實作 `Illuminate\Contracts\Container\ContextualAttribute` 契約來建立自己的情境屬性。容器將呼叫您屬性的 `resolve` 方法，該方法應解析應該注入到使用該屬性的類別中的值。在下面的範例中，我們將重新實作 Laravel 內建的 `Config` 屬性：

```php
<?php

namespace App\Attributes;

use Attribute;
use Illuminate\Contracts\Container\Container;
use Illuminate\Contracts\Container\ContextualAttribute;

#[Attribute(Attribute::TARGET_PARAMETER)]
class Config implements ContextualAttribute
{
    /**
     * Create a new attribute instance.
     */
    public function __construct(public string $key, public mixed $default = null)
    {
    }

    /**
     * Resolve the configuration value.
     *
     * @param  self  $attribute
     * @param  \Illuminate\Contracts\Container\Container  $container
     * @return mixed
     */
    public static function resolve(self $attribute, Container $container)
    {
        return $container->make('config')->get($attribute->key, $attribute->default);
    }
}
```

<a name="binding-primitives"></a>

### 綁定基本型別

有時候您可能有一個類別接收了一些注入的類別，但也需要注入一個基本型別值，例如整數。您可以輕鬆地使用情境式綁定來注入類別可能需要的任何值：

```php
use App\Http\Controllers\UserController;

$this->app->when(UserController::class)
    ->needs('$variableName')
    ->give($value);
```

有時候一個類別可能依賴於一個 [標籤化](#tagging) 實例陣列。使用 `giveTagged` 方法，您可以輕鬆地注入所有具有該標籤的容器綁定：

```php
$this->app->when(ReportAggregator::class)
    ->needs('$reports')
    ->giveTagged('reports');
```

如果您需要從應用程式的配置檔案中注入值，您可以使用 `giveConfig` 方法：

```php
$this->app->when(ReportAggregator::class)
    ->needs('$timezone')
    ->giveConfig('app.timezone');
```

<a name="binding-typed-variadics"></a>

### 綁定型別可變參數

有時候，您可能會有一個類別透過可變參數的建構函式引數接收一個型別物件的陣列：

```php
<?php

use App\Models\Filter;
use App\Services\Logger;

class Firewall
{
    /**
     * The filter instances.
     *
     * @var array
     */
    protected $filters;

    /**
     * Create a new class instance.
     */
    public function __construct(
        protected Logger $logger,
        Filter ...$filters,
    ) {
        $this->filters = $filters;
    }
}
```

使用情境式綁定，您可以透過向 `give` 方法提供一個閉包來解析此依賴，該閉包回傳一個已解析的 `Filter` 實例陣列：

```php
$this->app->when(Firewall::class)
    ->needs(Filter::class)
    ->give(function (Application $app) {
          return [
              $app->make(NullFilter::class),
              $app->make(ProfanityFilter::class),
              $app->make(TooLongFilter::class),
          ];
    });
```

為了方便起見，您也可以直接提供一個類別名稱陣列，以便容器在 `Firewall` 需要 `Filter` 實例時進行解析：

```php
$this->app->when(Firewall::class)
    ->needs(Filter::class)
    ->give([
        NullFilter::class,
        ProfanityFilter::class,
        TooLongFilter::class,
    ]);
```

<a name="variadic-tag-dependencies"></a>

#### 可變參數標籤依賴

有時候一個類別可能會有一個型別提示為給定類別 (`Report ...$reports`) 的可變參數依賴。使用 `needs` 和 `giveTagged` 方法，您可以輕鬆地為給定的依賴注入所有具有該 [標籤](#tagging) 的容器綁定：

```php
$this->app->when(ReportAggregator::class)
    ->needs(Report::class)
    ->giveTagged('reports');
```

<a name="tagging"></a>

### 標籤

有時候，您可能需要解析某個「類別」的所有綁定。例如，您可能正在建構一個報告分析器，它接收一個包含許多不同 `Report` 介面實作的陣列。在註冊 `Report` 實作之後，您可以使用 `tag` 方法為它們分配一個標籤：

```php
$this->app->bind(CpuReport::class, function () {
    // ...
});

$this->app->bind(MemoryReport::class, function () {
    // ...
});

$this->app->tag([CpuReport::class, MemoryReport::class], 'reports');
```

一旦服務被標籤化，您就可以透過容器的 `tagged` 方法輕鬆解析所有這些服務：

```php
$this->app->bind(ReportAnalyzer::class, function (Application $app) {
    return new ReportAnalyzer($app->tagged('reports'));
});
```

<a name="extending-bindings"></a>

### 擴展綁定

`extend` 方法允許修改已解析的服務。例如，當服務被解析時，您可以執行額外的程式碼來裝飾或配置該服務。 `extend` 方法接受兩個引數：您要擴展的服務類別，以及一個應該回傳修改後服務的閉包。該閉包接收正在解析的服務和容器實例：

```php
$this->app->extend(Service::class, function (Service $service, Application $app) {
    return new DecoratedService($service);
});
```

<a name="resolving"></a>

## 解析

<a name="the-make-method"></a>

### `make` 方法

您可以使用 `make` 方法從容器中解析類別實例。`make` 方法接受您希望解析的類別或介面名稱：

```php
use App\Services\Transistor;

$transistor = $this->app->make(Transistor::class);
```

如果您類別的一些依賴無法透過容器解析，您可以將它們作為關聯陣列傳遞給 `makeWith` 方法來注入。例如，我們可以手動傳遞 `Transistor` 服務所需的 `$id` 建構式參數：

```php
use App\Services\Transistor;

$transistor = $this->app->makeWith(Transistor::class, ['id' => 1]);
```

`bound` 方法可以用來判斷類別或介面是否已明確綁定到容器中：

```php
if ($this->app->bound(Transistor::class)) {
    // ...
}
```

如果您在服務提供者之外，在程式碼中無法存取 `$app` 變數的位置，您可以使用 `App` [Facade](/docs/{{version}}/facades) 或 `app` [輔助函式](/docs/{{version}}/helpers#method-app) 從容器中解析類別實例：

```php
use App\Services\Transistor;
use Illuminate\Support\Facades\App;

$transistor = App::make(Transistor::class);

$transistor = app(Transistor::class);
```

如果您希望將 Laravel 容器實例本身注入到一個由容器解析的類別中，您可以在類別的建構式中型別提示 `Illuminate\Container\Container` 類別：

```php
use Illuminate\Container\Container;

/**
 * Create a new class instance.
 */
public function __construct(
    protected Container $container,
) {}
```

<a name="automatic-injection"></a>

### 自動注入

另一種，也是很重要的方法是，您可以在由容器解析的類別（包括 [控制器](/docs/{{version}}/controllers)、[事件監聽器](/docs/{{version}}/events)、[中介層](/docs/{{version}}/middleware) 等）的建構式中型別提示依賴。此外，您可以在 [佇列工作](/docs/{{version}}/queues) 的 `handle` 方法中型別提示依賴。實際上，這就是您的大多數物件應該由容器解析的方式。

例如，您可以在控制器的建構式中型別提示應用程式定義的服務。該服務將會被自動解析並注入到類別中：

```php
<?php

namespace App\Http\Controllers;

use App\Services\AppleMusic;

class PodcastController extends Controller
{
    /**
     * Create a new controller instance.
     */
    public function __construct(
        protected AppleMusic $apple,
    ) {}

    /**
     * Show information about the given podcast.
     */
    public function show(string $id): Podcast
    {
        return $this->apple->findPodcast($id);
    }
}
```

<a name="method-invocation-and-injection"></a>

## 方法調用與注入

有時您可能希望在物件實例上調用方法，同時允許容器自動注入該方法的依賴。例如，給定以下類別：

```php
<?php

namespace App;

use App\Services\AppleMusic;

class PodcastStats
{
    /**
     * Generate a new podcast stats report.
     */
    public function generate(AppleMusic $apple): array
    {
        return [
            // ...
        ];
    }
}
```

您可以像這樣透過容器調用 `generate` 方法：

```php
use App\PodcastStats;
use Illuminate\Support\Facades\App;

$stats = App::call([new PodcastStats, 'generate']);
```

`call` 方法接受任何 PHP 可調用 (callable)。容器的 `call` 方法甚至可以用來調用閉包，同時自動注入其依賴：

```php
use App\Services\AppleMusic;
use Illuminate\Support\Facades\App;

$result = App::call(function (AppleMusic $apple) {
    // ...
});
```

<a name="container-events"></a>

## 容器事件

服務容器每次解析物件時都會觸發一個事件。您可以使用 `resolving` 方法監聽此事件：

```php
use App\Services\Transistor;
use Illuminate\Contracts\Foundation\Application;

$this->app->resolving(Transistor::class, function (Transistor $transistor, Application $app) {
    // Called when container resolves objects of type "Transistor"...
});

$this->app->resolving(function (mixed $object, Application $app) {
    // Called when container resolves object of any type...
});
```

如您所見，正在解析的物件將會傳遞給回調，讓您可以在將其傳遞給其消費者之前，在物件上設定任何額外屬性。

<a name="rebinding"></a>

### 重新綁定

`rebinding` 方法允許您監聽服務何時被重新綁定到容器，這表示它在初始綁定之後再次註冊或被覆寫。這在您每次更新特定綁定時，需要更新依賴或修改行為時會很有用：

```php
use App\Contracts\PodcastPublisher;
use App\Services\SpotifyPublisher;
use App\Services\TransistorPublisher;
use Illuminate\Contracts\Foundation\Application;

$this->app->bind(PodcastPublisher::class, SpotifyPublisher::class);

$this->app->rebinding(
    PodcastPublisher::class,
    function (Application $app, PodcastPublisher $newInstance) {
        //
    },
);

// New binding will trigger rebinding closure...
$this->app->bind(PodcastPublisher::class, TransistorPublisher::class);
```

<a name="psr-11"></a>

## PSR-11

Laravel 的服務容器實作了 [PSR-11](https://github.com/php-fig/fig-standards/blob/master/accepted/PSR-11-container.md) 介面。因此，您可以型別提示 PSR-11 容器介面以取得 Laravel 容器的實例：

```php
use App\Services\Transistor;
use Psr\Container\ContainerInterface;

Route::get('/', function (ContainerInterface $container) {
    $service = $container->get(Transistor::class);

    // ...
});
```

如果給定的識別碼無法解析，將會拋出一個例外。如果識別碼從未綁定，該例外將會是 `Psr\Container\NotFoundExceptionInterface` 的實例。如果識別碼已綁定但無法解析，則將會拋出 `Psr\Container\ContainerExceptionInterface` 的實例。