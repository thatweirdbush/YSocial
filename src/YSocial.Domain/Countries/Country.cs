using Microservice.BuildingBlocks.Domain.Enumerations;
using YSocial.Domain.Countries.Rules;

namespace YSocial.Domain.Countries;

public sealed record Country(string Name, string ISO) : Enumeration<Country>
{
    public static readonly Country Ukraine = Create(nameof(Ukraine), "UA");

    public static readonly Country Poland = Create(nameof(Poland), "PL");

    public static readonly Country UnitedStates = Create(nameof(UnitedStates), "US");

    public static readonly Country Canada = Create(nameof(Canada), "CA");

    public static readonly Country Mexico = Create(nameof(Mexico), "MX");

    public static readonly Country Germany = Create(nameof(Germany), "DE");

    public static readonly Country France = Create(nameof(France), "FR");

    public static readonly Country Italy = Create(nameof(Italy), "IT");

    public static readonly Country Spain = Create(nameof(Spain), "ES");

    public static readonly Country Portugal = Create(nameof(Portugal), "PT");

    public static readonly Country Greece = Create(nameof(Greece), "GR");

    public static readonly Country Turkey = Create(nameof(Turkey), "TR");

    public static readonly Country China = Create(nameof(China), "CN");

    public static readonly Country Japan = Create(nameof(Japan), "JP");

    public static readonly Country SouthKorea = Create(nameof(SouthKorea), "KR");

    public static readonly Country Australia = Create(nameof(Australia), "AU");

    public static readonly Country NewZealand = Create(nameof(NewZealand), "NZ");

    public static readonly Country SouthAfrica = Create(nameof(SouthAfrica), "ZA");

    public static readonly Country Argentina = Create(nameof(Argentina), "AR");

    public static readonly Country Brazil = Create(nameof(Brazil), "BR");

    public static readonly Country Chile = Create(nameof(Chile), "CL");

    public static readonly Country Colombia = Create(nameof(Colombia), "CO");

    public static readonly Country Peru = Create(nameof(Peru), "PE");

    public static readonly Country Venezuela = Create(nameof(Venezuela), "VE");

    public static readonly Country Egypt = Create(nameof(Egypt), "EG");

    public static readonly Country India = Create(nameof(India), "IN");

    public static readonly Country Indonesia = Create(nameof(Indonesia), "ID");

    public static readonly Country Malaysia = Create(nameof(Malaysia), "MY");

    public static readonly Country Philippines = Create(nameof(Philippines), "PH");

    public static readonly Country Thailand = Create(nameof(Thailand), "TH");

    public static readonly Country Vietnam = Create(nameof(Vietnam), "VN");

    public static readonly Country SaudiArabia = Create(nameof(SaudiArabia), "SA");

    public static readonly Country UnitedArabEmirates = Create(nameof(UnitedArabEmirates), "AE");

    public static readonly Country UnitedKingdom = Create(nameof(UnitedKingdom), "GB");

    public static Country Create(string name, string iso)
    {
        CheckRule(new CountryNameMustNotBeEmpty(name));
        CheckRule(new CountryISOMustNotBeEmpty(iso));
        CheckRule(new CountryISOMustHaveTwoSigns(iso));
        CheckRule(new CountryISOMustContainsOnlyLetters(iso));
        CheckRule(new CountryISOMustBeInUppercase(iso));

        return new(name, iso);
    }
}